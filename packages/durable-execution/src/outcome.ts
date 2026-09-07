import {
  isViraDurableExecutionRecord,
  type ViraDurableExecutionRecord,
  type ViraDurableExecutionResult,
} from "./index.js";

export const VIRA_DURABLE_EXECUTION_PRIVATE_OUTCOMES = Object.freeze([
  "accepted",
  "rejected",
  "uncertain",
] as const);

export type ViraDurableExecutionPrivateOutcome = (typeof VIRA_DURABLE_EXECUTION_PRIVATE_OUTCOMES)[number];

export interface ViraRecordDurableExecutionPrivateOutcomeInput {
  readonly record: ViraDurableExecutionRecord;
  readonly workerId: string;
  readonly leaseEpoch: number;
  readonly expectedRevision: number;
  readonly nowEpochMs: number;
  readonly outcome: ViraDurableExecutionPrivateOutcome;
}

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/;

function fail<T>(
  code: "INVALID_INPUT" | "INVALID_STATE" | "STALE_REVISION" | "STALE_LEASE",
  path: string,
  message: string,
): ViraDurableExecutionResult<T> {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function safeToken(value: unknown): value is string {
  return typeof value === "string" && SAFE_TOKEN.test(value) && value.trim() === value;
}

function safePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function freezeRecord(record: ViraDurableExecutionRecord): ViraDurableExecutionRecord {
  if (record.lease !== null && !Object.isFrozen(record.lease)) Object.freeze(record.lease);
  return Object.freeze(record);
}

export function recordViraDurableExecutionPrivateOutcome(
  input: ViraRecordDurableExecutionPrivateOutcomeInput,
): ViraDurableExecutionResult<ViraDurableExecutionRecord> {
  if (
    input === null
    || typeof input !== "object"
    || !isViraDurableExecutionRecord(input.record)
    || !safeToken(input.workerId)
    || !safePositive(input.leaseEpoch)
    || !safePositive(input.expectedRevision)
    || !safePositive(input.nowEpochMs)
    || !VIRA_DURABLE_EXECUTION_PRIVATE_OUTCOMES.includes(input.outcome)
  ) return fail("INVALID_INPUT", "$", "private dispatch outcome input is invalid");

  if (input.record.revision !== input.expectedRevision) {
    return fail("STALE_REVISION", "$.expectedRevision", "execution revision changed before private dispatch outcome");
  }
  if (
    input.record.status !== "executing"
    || input.record.dispatchState !== "started"
  ) return fail("INVALID_STATE", "$.record", "private dispatch outcome requires executing/started state");
  if (
    input.record.lease === null
    || input.record.lease.workerId !== input.workerId
    || input.record.lease.epoch !== input.leaseEpoch
    || input.record.leaseEpoch !== input.leaseEpoch
    || input.record.lease.expiresAtEpochMs <= input.nowEpochMs
  ) return fail("STALE_LEASE", "$.record.lease", "private dispatch outcome requires the current live fenced lease");

  const status = input.outcome === "accepted"
    ? "verifying"
    : input.outcome === "rejected"
      ? "manual"
      : "uncertain";

  return {
    ok: true,
    value: freezeRecord({
      ...input.record,
      revision: input.record.revision + 1,
      status,
      lease: null,
      updatedAtEpochMs: input.nowEpochMs,
    }),
  };
}
