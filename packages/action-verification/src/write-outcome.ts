import {
  isViraDurableActionVerificationRecord,
  type ViraDurableActionVerificationRecord,
  type ViraDurableActionVerificationResult,
  type ViraDurableActionVerificationStatus,
} from "./durable.js";

export type ViraVerificationWriteOutcome =
  | "precondition-conflict"
  | "provider-rejected"
  | "uncertain";

function fail(message: string): ViraDurableActionVerificationResult<ViraDurableActionVerificationRecord> {
  return { ok: false, issue: Object.freeze({ code: "INVALID_STATE" as const, message }) };
}

function safePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function recordViraVerificationWriteOutcome(input: {
  readonly record: ViraDurableActionVerificationRecord;
  readonly workerId: string;
  readonly leaseEpoch: number;
  readonly expectedRevision: number;
  readonly nowEpochMs: number;
  readonly outcome: ViraVerificationWriteOutcome;
}): ViraDurableActionVerificationResult<ViraDurableActionVerificationRecord> {
  const record = input.record;
  if (
    !isViraDurableActionVerificationRecord(record)
    || record.status !== "write-dispatched"
    || record.writeDispatchedAtEpochMs === null
    || record.revision !== input.expectedRevision
    || record.lease === null
    || record.lease.workerId !== input.workerId
    || record.lease.epoch !== input.leaseEpoch
    || record.leaseEpoch !== input.leaseEpoch
    || !safePositive(input.nowEpochMs)
    || record.lease.expiresAtEpochMs <= input.nowEpochMs
  ) return fail("write outcome requires the current fenced write-dispatched verification lease");

  const status: ViraDurableActionVerificationStatus = input.outcome === "precondition-conflict"
    ? "precondition-mismatch"
    : input.outcome === "provider-rejected"
      ? "manual"
      : "uncertain";

  return {
    ok: true,
    value: Object.freeze({
      ...record,
      scope: Object.freeze({ ...record.scope }),
      revision: record.revision + 1,
      status,
      lease: null,
      updatedAtEpochMs: input.nowEpochMs,
    }),
  };
}
