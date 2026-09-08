import { describe, expect, it } from "vitest";
import {
  allocateViraMultiPartySettlement, createViraPaymentReconciler, signViraFundsEvent,
  type ViraMultiPartyShareSchedule, type ViraSignedFundsEvent,
} from "../../packages/commercial-settlement/src/index.js";

const secret = new TextEncoder().encode("external-payment-provider-test-key");
const schedule: ViraMultiPartyShareSchedule = {
  version: "1", settlementRef: "settlement:standard@1", currency: "USD",
  sharesBps: { publisher: 4000, provider: 2000, model: 1500, node: 500, platform: 2000 },
};
const allocated = allocateViraMultiPartySettlement({ evidenceRef: "allocation:001", sourcePriceEvidenceRef: "price:001", grossAmountNanos: "10000000003", schedule });
if (!allocated.ok) throw new Error(allocated.issue.code);
const allocation = allocated.value;

function event(overrides: Partial<Omit<ViraSignedFundsEvent, "signature"> & { signature: string }> = {}): ViraSignedFundsEvent {
  const unsigned = { version: "1" as const, eventId: "funds:001", transactionRef: "transaction:001", sequence: 1, type: "payment" as const, amountNanos: allocation.grossAmountNanos, currency: "USD", occurredAtEpochMs: 2_000_000_000_000, ...overrides };
  return { ...unsigned, signature: overrides.signature ?? signViraFundsEvent(unsigned, secret) };
}

describe("PROD-21 multi-party settlement and reconciliation", () => {
  it("allocates publisher/provider/model/node/platform shares deterministically in integer nanos", () => {
    const second = allocateViraMultiPartySettlement({ evidenceRef: "allocation:001", sourcePriceEvidenceRef: "price:001", grossAmountNanos: "10000000003", schedule });
    expect(second).toEqual(allocated);
    expect(allocated.value).toMatchObject({ semantics: "allocation-only", fundsMoved: false, allocationsNanos: { publisher: "4000000001", provider: "2000000000", model: "1500000000", node: "500000000", platform: "2000000002" } });
    expect(Object.values(allocated.value.allocationsNanos).reduce((sum, value) => sum + BigInt(value), 0n)).toBe(BigInt(allocated.value.grossAmountNanos));
  });

  it.each([
    ["basis points", { ...schedule, sharesBps: { ...schedule.sharesBps, platform: 2001 } }, "INVALID_SHARE"],
    ["negative share", { ...schedule, sharesBps: { ...schedule.sharesBps, node: -1, platform: 2501 } }, "INVALID_SHARE"],
  ])("rejects invalid %s", (_name, badSchedule, code) => {
    expect(allocateViraMultiPartySettlement({ evidenceRef: "allocation:bad", sourcePriceEvidenceRef: "price:001", grossAmountNanos: "100", schedule: badSchedule })).toMatchObject({ ok: false, issue: { code } });
  });

  it("rejects nanos overflow", () => {
    expect(allocateViraMultiPartySettlement({ evidenceRef: "allocation:bad", sourcePriceEvidenceRef: "price:001", grossAmountNanos: "9223372036854775808", schedule })).toMatchObject({ ok: false, issue: { code: "OVERFLOW" } });
  });

  it("reconciles signed external payment evidence without converting allocation into funds movement", () => {
    const result = createViraPaymentReconciler(secret).reconcile(event(), allocated.value);
    expect(result).toMatchObject({ ok: true, value: { outcome: "matched", allocationEvidenceRef: "allocation:001", semantics: "reconciliation-only" } });
    expect(result.ok && result.value).not.toHaveProperty("fundsMoved");
  });

  it("fails closed for forged signatures", () => {
    expect(createViraPaymentReconciler(secret).reconcile(event({ signature: `sha256:${"0".repeat(64)}` }), allocated.value)).toMatchObject({ ok: false, issue: { code: "INVALID_SIGNATURE" } });
  });

  it("deduplicates and rejects out-of-order delivery before changing sequence", () => {
    const reconciler = createViraPaymentReconciler(secret);
    expect(reconciler.reconcile(event(), allocated.value)).toMatchObject({ ok: true });
    expect(reconciler.reconcile(event(), allocated.value)).toMatchObject({ ok: false, issue: { code: "DUPLICATE_EVENT" } });
    expect(reconciler.reconcile(event({ eventId: "funds:003", sequence: 3 }), allocated.value)).toMatchObject({ ok: false, issue: { code: "OUT_OF_ORDER_EVENT" } });
    expect(reconciler.reconcile(event({ eventId: "funds:002", sequence: 2, type: "refund" }), allocated.value)).toMatchObject({ ok: true });
  });

  it("rejects currency drift and reports amount mismatch explicitly", () => {
    expect(createViraPaymentReconciler(secret).reconcile(event({ currency: "EUR" }), allocated.value)).toMatchObject({ ok: false, issue: { code: "CURRENCY_MISMATCH" } });
    expect(createViraPaymentReconciler(secret).reconcile(event({ amountNanos: "1" }), allocated.value)).toMatchObject({ ok: true, value: { outcome: "mismatch", expectedAmountNanos: "10000000003", observedAmountNanos: "1" } });
  });

  it("supports payment, refund and publisher payout evidence as distinct external events", () => {
    const reconciler = createViraPaymentReconciler(secret);
    expect(reconciler.reconcile(event(), allocated.value)).toMatchObject({ ok: true, value: { eventType: "payment" } });
    expect(reconciler.reconcile(event({ eventId: "funds:002", sequence: 2, type: "refund" }), allocated.value)).toMatchObject({ ok: true, value: { eventType: "refund" } });
    expect(reconciler.reconcile(event({ eventId: "funds:003", sequence: 3, type: "payout", amountNanos: allocated.value.allocationsNanos.publisher }), allocated.value)).toMatchObject({ ok: true, value: { eventType: "payout", outcome: "matched" } });
  });
});
