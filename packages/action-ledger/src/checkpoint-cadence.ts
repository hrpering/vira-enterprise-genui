import {
  issueViraProductionActionLedgerCheckpoint,
  type ViraProductionActionLedgerCheckpoint,
  type ViraProductionActionLedgerCheckpointSigner,
  type ViraProductionActionLedgerEntry,
  type ViraProductionActionLedgerResult,
} from "./production.js";

export const VIRA_ACTION_LEDGER_MAX_CHECKPOINT_ENTRY_INTERVAL = 10_000;
export const VIRA_ACTION_LEDGER_MAX_CHECKPOINT_AGE_MS = 24 * 60 * 60 * 1_000;

export interface ViraProductionActionLedgerCheckpointPolicy {
  readonly maxEntriesWithoutCheckpoint: number;
  readonly maxAgeMs: number;
}

export type ViraProductionActionLedgerCheckpointCadenceReason = "entry-count" | "age" | "none";

export interface ViraProductionActionLedgerCheckpointCadenceDecision {
  readonly required: boolean;
  readonly reason: ViraProductionActionLedgerCheckpointCadenceReason;
  readonly entriesSinceCheckpoint: number;
  readonly ageMs: number;
}

function safePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function safeNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function exactScope(
  left: ViraProductionActionLedgerEntry["scope"],
  right: ViraProductionActionLedgerCheckpoint["scope"],
): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function exactStream(
  head: ViraProductionActionLedgerEntry,
  checkpoint: ViraProductionActionLedgerCheckpoint,
): boolean {
  return exactScope(head.scope, checkpoint.scope)
    && head.ledgerId === checkpoint.ledgerId
    && head.transactionId === checkpoint.transactionId
    && head.planDigest === checkpoint.planDigest
    && head.planRevision === checkpoint.planRevision;
}

function validatePolicy(policy: ViraProductionActionLedgerCheckpointPolicy): void {
  if (
    policy === null
    || typeof policy !== "object"
    || !safePositive(policy.maxEntriesWithoutCheckpoint)
    || policy.maxEntriesWithoutCheckpoint > VIRA_ACTION_LEDGER_MAX_CHECKPOINT_ENTRY_INTERVAL
    || !safePositive(policy.maxAgeMs)
    || policy.maxAgeMs > VIRA_ACTION_LEDGER_MAX_CHECKPOINT_AGE_MS
  ) throw new TypeError("production Action Ledger checkpoint cadence policy is invalid");
}

export function evaluateViraProductionActionLedgerCheckpointCadence(input: {
  readonly head: ViraProductionActionLedgerEntry;
  readonly previousCheckpoint: ViraProductionActionLedgerCheckpoint | null;
  readonly firstEntryOccurredAtEpochMs: number;
  readonly nowEpochMs: number;
  readonly policy: ViraProductionActionLedgerCheckpointPolicy;
}): ViraProductionActionLedgerCheckpointCadenceDecision {
  if (
    input === null
    || typeof input !== "object"
    || input.head === null
    || typeof input.head !== "object"
    || !safeNonNegative(input.head.sequence)
    || !safePositive(input.head.occurredAtEpochMs)
    || !safePositive(input.firstEntryOccurredAtEpochMs)
    || !safePositive(input.nowEpochMs)
    || input.firstEntryOccurredAtEpochMs > input.head.occurredAtEpochMs
    || input.head.occurredAtEpochMs > input.nowEpochMs
  ) throw new TypeError("production Action Ledger checkpoint cadence input is invalid");
  validatePolicy(input.policy);

  let entriesSinceCheckpoint: number;
  let ageAnchorEpochMs: number;
  if (input.previousCheckpoint === null) {
    entriesSinceCheckpoint = input.head.sequence + 1;
    ageAnchorEpochMs = input.firstEntryOccurredAtEpochMs;
  } else {
    const checkpoint = input.previousCheckpoint;
    if (
      !exactStream(input.head, checkpoint)
      || !safeNonNegative(checkpoint.sequence)
      || !safePositive(checkpoint.issuedAtEpochMs)
      || checkpoint.sequence > input.head.sequence
      || checkpoint.issuedAtEpochMs > input.nowEpochMs
      || (checkpoint.sequence === input.head.sequence && checkpoint.chainHeadHash !== input.head.entryHash)
    ) throw new TypeError("production Action Ledger previous checkpoint does not bind the current stream");
    entriesSinceCheckpoint = input.head.sequence - checkpoint.sequence;
    ageAnchorEpochMs = checkpoint.issuedAtEpochMs;
  }

  const ageMs = input.nowEpochMs - ageAnchorEpochMs;
  if (!safeNonNegative(entriesSinceCheckpoint) || !safeNonNegative(ageMs)) {
    throw new TypeError("production Action Ledger checkpoint cadence arithmetic is invalid");
  }

  if (entriesSinceCheckpoint >= input.policy.maxEntriesWithoutCheckpoint) {
    return Object.freeze({ required: true, reason: "entry-count", entriesSinceCheckpoint, ageMs });
  }
  if (ageMs >= input.policy.maxAgeMs) {
    return Object.freeze({ required: true, reason: "age", entriesSinceCheckpoint, ageMs });
  }
  return Object.freeze({ required: false, reason: "none", entriesSinceCheckpoint, ageMs });
}

export async function issueViraProductionActionLedgerCheckpointIfDue(input: {
  readonly head: ViraProductionActionLedgerEntry;
  readonly previousCheckpoint: ViraProductionActionLedgerCheckpoint | null;
  readonly firstEntryOccurredAtEpochMs: number;
  readonly nowEpochMs: number;
  readonly policy: ViraProductionActionLedgerCheckpointPolicy;
  readonly signer: ViraProductionActionLedgerCheckpointSigner;
}): Promise<ViraProductionActionLedgerResult<ViraProductionActionLedgerCheckpoint | null>> {
  const cadence = evaluateViraProductionActionLedgerCheckpointCadence(input);
  if (!cadence.required) return { ok: true, value: null };
  return issueViraProductionActionLedgerCheckpoint({
    head: input.head,
    issuedAtEpochMs: input.nowEpochMs,
    signer: input.signer,
  });
}
