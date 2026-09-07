import {
  isViraDurableExecutionRecord,
  type ViraDurableExecutionRecord,
  type ViraDurableExecutionResult,
} from "./index.js";

export interface ViraMarkDurableExecutionDispatchInput {
  readonly record: ViraDurableExecutionRecord;
  readonly workerId: string;
  readonly leaseEpoch: number;
  readonly expectedRevision: number;
  readonly nowEpochMs: number;
}

export interface ViraRecoverDurableExecutionInput {
  readonly record: ViraDurableExecutionRecord;
  readonly expectedRevision: number;
  readonly nowEpochMs: number;
}

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/;

function fail<T>(code: "INVALID_INPUT" | "INVALID_STATE" | "STALE_REVISION" | "STALE_LEASE", path: string, message: string): ViraDurableExecutionResult<T> {
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

export function markViraDurableExecutionDispatchStarted(
  input: ViraMarkDurableExecutionDispatchInput,
): ViraDurableExecutionResult<ViraDurableExecutionRecord> {
  if (
    input === null
    || typeof input !== "object"
    || !isViraDurableExecutionRecord(input.record)
    || !safeToken(input.workerId)
    || !safePositive(input.leaseEpoch)
    || !safePositive(input.expectedRevision)
    || !safePositive(input.nowEpochMs)
  ) return fail("INVALID_INPUT", "$", "dispatch-start input is invalid");
  if (input.record.revision !== input.expectedRevision) {
    return fail("STALE_REVISION", "$.expectedRevision", "execution revision changed before dispatch start");
  }
  if (input.record.status !== "executing" || input.record.dispatchState !== "not-started") {
    return fail("INVALID_STATE", "$.record", "dispatch may start only once from executing/not-started state");
  }
  if (
    input.record.lease === null
    || input.record.lease.workerId !== input.workerId
    || input.record.lease.epoch !== input.leaseEpoch
    || input.record.leaseEpoch !== input.leaseEpoch
    || input.record.lease.expiresAtEpochMs <= input.nowEpochMs
  ) return fail("STALE_LEASE", "$.record.lease", "dispatch requires the current live fenced worker lease");

  return {
    ok: true,
    value: freezeRecord({
      ...input.record,
      revision: input.record.revision + 1,
      dispatchState: "started",
      updatedAtEpochMs: input.nowEpochMs,
    }),
  };
}

export function recoverViraDurableExecutionAfterLeaseExpiry(
  input: ViraRecoverDurableExecutionInput,
): ViraDurableExecutionResult<ViraDurableExecutionRecord> {
  if (
    input === null
    || typeof input !== "object"
    || !isViraDurableExecutionRecord(input.record)
    || !safePositive(input.expectedRevision)
    || !safePositive(input.nowEpochMs)
  ) return fail("INVALID_INPUT", "$", "lease-expiry recovery input is invalid");
  if (input.record.revision !== input.expectedRevision) {
    return fail("STALE_REVISION", "$.expectedRevision", "execution revision changed before lease recovery");
  }
  if (input.record.status !== "executing" || input.record.lease === null) {
    return fail("INVALID_STATE", "$.record", "only a leased executing record can enter lease-expiry recovery");
  }
  if (input.record.lease.expiresAtEpochMs > input.nowEpochMs) {
    return fail("STALE_LEASE", "$.record.lease", "live worker lease cannot be recovered by another worker");
  }

  return {
    ok: true,
    value: freezeRecord({
      ...input.record,
      revision: input.record.revision + 1,
      status: input.record.dispatchState === "started" ? "uncertain" : "recovery",
      lease: null,
      updatedAtEpochMs: input.nowEpochMs,
    }),
  };
}
