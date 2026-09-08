import { createHmac, timingSafeEqual } from "node:crypto";

export const VIRA_MULTI_PARTY_SETTLEMENT_VERSION = "1" as const;
export const VIRA_SETTLEMENT_BPS_DENOMINATOR = 10_000;
export const VIRA_SETTLEMENT_MAX_NANOS = 9_223_372_036_854_775_807n;

export type ViraSettlementParty = "publisher" | "provider" | "model" | "node" | "platform";
export type ViraFundsEventType = "payment" | "refund" | "payout";

export interface ViraMultiPartyShareSchedule {
  readonly version: "1";
  readonly settlementRef: string;
  readonly currency: string;
  readonly sharesBps: Readonly<Record<ViraSettlementParty, number>>;
}

export interface ViraMultiPartyAllocationEvidence {
  readonly version: "1";
  readonly evidenceRef: string;
  readonly settlementRef: string;
  readonly sourcePriceEvidenceRef: string;
  readonly currency: string;
  readonly grossAmountNanos: string;
  readonly allocationsNanos: Readonly<Record<ViraSettlementParty, string>>;
  readonly semantics: "allocation-only";
  readonly fundsMoved: false;
}

export interface ViraSignedFundsEvent {
  readonly version: "1";
  readonly eventId: string;
  readonly transactionRef: string;
  readonly sequence: number;
  readonly type: ViraFundsEventType;
  readonly amountNanos: string;
  readonly currency: string;
  readonly occurredAtEpochMs: number;
  readonly signature: string;
}

export interface ViraReconciliationRecord {
  readonly version: "1";
  readonly recordRef: string;
  readonly allocationEvidenceRef: string;
  readonly fundsEventId: string;
  readonly transactionRef: string;
  readonly eventType: ViraFundsEventType;
  readonly currency: string;
  readonly expectedAmountNanos: string;
  readonly observedAmountNanos: string;
  readonly outcome: "matched" | "mismatch";
  readonly semantics: "reconciliation-only";
}

export type ViraSettlementIssueCode =
  | "INVALID_INPUT" | "INVALID_SHARE" | "INVALID_AMOUNT" | "OVERFLOW"
  | "INVALID_SIGNATURE" | "DUPLICATE_EVENT" | "OUT_OF_ORDER_EVENT"
  | "CURRENCY_MISMATCH" | "ALLOCATION_REFERENCE_MISMATCH";

export type ViraSettlementResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: { readonly code: ViraSettlementIssueCode; readonly message: string } };

const PARTIES: readonly ViraSettlementParty[] = ["publisher", "provider", "model", "node", "platform"];
const REF = /^[a-z][a-z0-9._:@-]{2,255}$/;
const CURRENCY = /^[A-Z]{3}$/;
const NANOS = /^(0|[1-9][0-9]{0,18})$/;
const HEX_SIGNATURE = /^sha256:[a-f0-9]{64}$/;

function failure(code: ViraSettlementIssueCode, message: string): ViraSettlementResult<never> {
  return { ok: false, issue: Object.freeze({ code, message }) };
}

function exactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function amount(value: unknown): bigint | null {
  if (typeof value !== "string" || !NANOS.test(value)) return null;
  const parsed = BigInt(value);
  return parsed <= VIRA_SETTLEMENT_MAX_NANOS ? parsed : null;
}

export function allocateViraMultiPartySettlement(input: {
  readonly evidenceRef: string;
  readonly sourcePriceEvidenceRef: string;
  readonly grossAmountNanos: string;
  readonly schedule: ViraMultiPartyShareSchedule;
}): ViraSettlementResult<ViraMultiPartyAllocationEvidence> {
  if (!exactRecord(input, ["evidenceRef", "sourcePriceEvidenceRef", "grossAmountNanos", "schedule"])) return failure("INVALID_INPUT", "allocation input must be exact");
  if (!REF.test(input.evidenceRef) || !REF.test(input.sourcePriceEvidenceRef)) return failure("INVALID_INPUT", "evidence references must be canonical");
  const schedule = input.schedule;
  if (!exactRecord(schedule, ["version", "settlementRef", "currency", "sharesBps"]) || schedule.version !== "1" || !REF.test(schedule.settlementRef) || !CURRENCY.test(schedule.currency)) return failure("INVALID_INPUT", "schedule must be exact and versioned");
  if (!exactRecord(schedule.sharesBps, PARTIES)) return failure("INVALID_SHARE", "all and only canonical parties are required");
  let totalBps = 0;
  for (const party of PARTIES) {
    const share = schedule.sharesBps[party];
    if (!Number.isSafeInteger(share) || share < 0 || share > VIRA_SETTLEMENT_BPS_DENOMINATOR) return failure("INVALID_SHARE", `${party} share is invalid`);
    totalBps += share;
  }
  if (totalBps !== VIRA_SETTLEMENT_BPS_DENOMINATOR) return failure("INVALID_SHARE", "party shares must total 10000 bps");
  const gross = amount(input.grossAmountNanos);
  if (gross === null) {
    const overflow = NANOS.test(input.grossAmountNanos) && BigInt(input.grossAmountNanos) > VIRA_SETTLEMENT_MAX_NANOS;
    return failure(overflow ? "OVERFLOW" : "INVALID_AMOUNT", "gross nanos must be a bounded canonical integer");
  }

  const allocations = {} as Record<ViraSettlementParty, string>;
  let distributed = 0n;
  for (const party of PARTIES.slice(0, -1)) {
    const part = gross * BigInt(schedule.sharesBps[party]) / BigInt(VIRA_SETTLEMENT_BPS_DENOMINATOR);
    allocations[party] = part.toString();
    distributed += part;
  }
  allocations.platform = (gross - distributed).toString();
  return { ok: true, value: Object.freeze({
    version: "1", evidenceRef: input.evidenceRef, settlementRef: schedule.settlementRef,
    sourcePriceEvidenceRef: input.sourcePriceEvidenceRef, currency: schedule.currency,
    grossAmountNanos: gross.toString(), allocationsNanos: Object.freeze(allocations),
    semantics: "allocation-only", fundsMoved: false,
  }) };
}

function unsignedEvent(event: Omit<ViraSignedFundsEvent, "signature">): string {
  return JSON.stringify([event.version, event.eventId, event.transactionRef, event.sequence, event.type, event.amountNanos, event.currency, event.occurredAtEpochMs]);
}

export function signViraFundsEvent(event: Omit<ViraSignedFundsEvent, "signature">, secret: Uint8Array): string {
  return `sha256:${createHmac("sha256", secret).update(unsignedEvent(event)).digest("hex")}`;
}

export function createViraPaymentReconciler(secret: Uint8Array) {
  const seen = new Set<string>();
  const sequenceByTransaction = new Map<string, number>();
  return Object.freeze({
    reconcile(event: ViraSignedFundsEvent, allocation: ViraMultiPartyAllocationEvidence): ViraSettlementResult<ViraReconciliationRecord> {
      if (!exactRecord(event, ["version", "eventId", "transactionRef", "sequence", "type", "amountNanos", "currency", "occurredAtEpochMs", "signature"]) || event.version !== "1" || !REF.test(event.eventId) || !REF.test(event.transactionRef) || !Number.isSafeInteger(event.sequence) || event.sequence < 1 || !["payment", "refund", "payout"].includes(event.type) || amount(event.amountNanos) === null || !CURRENCY.test(event.currency) || !Number.isSafeInteger(event.occurredAtEpochMs) || !HEX_SIGNATURE.test(event.signature)) return failure("INVALID_INPUT", "funds event must be strict, bounded and versioned");
      const expectedSignature = signViraFundsEvent({ version: event.version, eventId: event.eventId, transactionRef: event.transactionRef, sequence: event.sequence, type: event.type, amountNanos: event.amountNanos, currency: event.currency, occurredAtEpochMs: event.occurredAtEpochMs }, secret);
      if (!timingSafeEqual(Buffer.from(event.signature), Buffer.from(expectedSignature))) return failure("INVALID_SIGNATURE", "funds event signature is invalid");
      if (seen.has(event.eventId)) return failure("DUPLICATE_EVENT", "funds event was already reconciled");
      const expectedSequence = (sequenceByTransaction.get(event.transactionRef) ?? 0) + 1;
      if (event.sequence !== expectedSequence) return failure("OUT_OF_ORDER_EVENT", `expected sequence ${expectedSequence}`);
      if (event.currency !== allocation.currency) return failure("CURRENCY_MISMATCH", "funds event currency differs from allocation evidence");
      if (!REF.test(allocation.evidenceRef) || allocation.semantics !== "allocation-only" || allocation.fundsMoved !== false) return failure("ALLOCATION_REFERENCE_MISMATCH", "allocation evidence boundary is invalid");
      seen.add(event.eventId);
      sequenceByTransaction.set(event.transactionRef, event.sequence);
      const expected = event.type === "payout" ? allocation.allocationsNanos.publisher : allocation.grossAmountNanos;
      return { ok: true, value: Object.freeze({ version: "1", recordRef: `reconciliation:${event.eventId}`, allocationEvidenceRef: allocation.evidenceRef, fundsEventId: event.eventId, transactionRef: event.transactionRef, eventType: event.type, currency: event.currency, expectedAmountNanos: expected, observedAmountNanos: event.amountNanos, outcome: expected === event.amountNanos ? "matched" : "mismatch", semantics: "reconciliation-only" }) };
    },
  });
}
