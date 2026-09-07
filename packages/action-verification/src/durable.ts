import type { ViraEnterpriseScope } from "@vira-enterprise-genui/enterprise-context";
import type { ViraActionPostconditionStatus, ViraActionProviderObservation } from "./index.js";

export const VIRA_DURABLE_ACTION_VERIFICATION_VERSION = "1" as const;
export const VIRA_DURABLE_ACTION_VERIFICATION_STATUSES = Object.freeze([
  "pending-precheck",
  "precondition-mismatch",
  "ready-to-write",
  "write-dispatched",
  "verifying",
  "verified",
  "partial",
  "mismatch",
  "uncertain",
  "manual",
] as const);
export type ViraDurableActionVerificationStatus = (typeof VIRA_DURABLE_ACTION_VERIFICATION_STATUSES)[number];

export interface ViraDurableActionVerificationLease {
  readonly workerId: string;
  readonly epoch: number;
  readonly expiresAtEpochMs: number;
}

export interface ViraDurableActionVerificationRecord {
  readonly version: typeof VIRA_DURABLE_ACTION_VERIFICATION_VERSION;
  readonly scope: ViraEnterpriseScope;
  readonly verificationId: string;
  readonly transactionId: string;
  readonly planDigest: string;
  readonly planRevision: number;
  readonly operationId: string;
  readonly executionId: string;
  readonly attemptId: string;
  readonly providerId: string;
  readonly connectionId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly revision: number;
  readonly status: ViraDurableActionVerificationStatus;
  readonly leaseEpoch: number;
  readonly lease: ViraDurableActionVerificationLease | null;
  readonly beforeObservationDigest: string | null;
  readonly afterObservationDigest: string | null;
  readonly writeDispatchedAtEpochMs: number | null;
  readonly createdAtEpochMs: number;
  readonly updatedAtEpochMs: number;
}

export type ViraDurableActionVerificationIssueCode =
  | "INVALID_INPUT"
  | "STALE_REVISION"
  | "STALE_LEASE"
  | "INVALID_STATE";

export interface ViraDurableActionVerificationIssue {
  readonly code: ViraDurableActionVerificationIssueCode;
  readonly message: string;
}

export type ViraDurableActionVerificationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: ViraDurableActionVerificationIssue };

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;
const MAX_LEASE_MS = 5 * 60 * 1_000;

function fail<T>(code: ViraDurableActionVerificationIssueCode, message: string): ViraDurableActionVerificationResult<T> {
  return { ok: false, issue: Object.freeze({ code, message }) };
}

function safeToken(value: unknown): value is string {
  return typeof value === "string" && SAFE_TOKEN.test(value) && value.trim() === value;
}

function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function nonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function exactScope(left: ViraEnterpriseScope, right: ViraEnterpriseScope): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function freezeRecord(record: ViraDurableActionVerificationRecord): ViraDurableActionVerificationRecord {
  return Object.freeze({
    ...record,
    scope: Object.freeze({ ...record.scope }),
    lease: record.lease === null ? null : Object.freeze({ ...record.lease }),
  });
}

export function isViraDurableActionVerificationRecord(input: unknown): input is ViraDurableActionVerificationRecord {
  if (input === null || typeof input !== "object") return false;
  const record = input as Partial<ViraDurableActionVerificationRecord>;
  if (
    record.version !== VIRA_DURABLE_ACTION_VERIFICATION_VERSION
    || record.scope === undefined
    || record.scope === null
    || typeof record.scope !== "object"
    || record.scope.version !== "1"
    || !safeToken(record.scope.organizationId)
    || !safeToken(record.scope.projectId)
    || (record.scope.environment !== "dev" && record.scope.environment !== "staging" && record.scope.environment !== "production")
    || !safeToken(record.verificationId)
    || !safeToken(record.transactionId)
    || typeof record.planDigest !== "string"
    || !SHA256_HEX.test(record.planDigest)
    || !positive(record.planRevision)
    || !safeToken(record.operationId)
    || !safeToken(record.executionId)
    || !safeToken(record.attemptId)
    || !safeToken(record.providerId)
    || !safeToken(record.connectionId)
    || !safeToken(record.resourceType)
    || !safeToken(record.resourceId)
    || !positive(record.revision)
    || typeof record.status !== "string"
    || !VIRA_DURABLE_ACTION_VERIFICATION_STATUSES.includes(record.status as ViraDurableActionVerificationStatus)
    || !nonNegative(record.leaseEpoch)
    || (record.beforeObservationDigest !== null && (typeof record.beforeObservationDigest !== "string" || !SHA256_HEX.test(record.beforeObservationDigest)))
    || (record.afterObservationDigest !== null && (typeof record.afterObservationDigest !== "string" || !SHA256_HEX.test(record.afterObservationDigest)))
    || (record.writeDispatchedAtEpochMs !== null && !positive(record.writeDispatchedAtEpochMs))
    || !positive(record.createdAtEpochMs)
    || !positive(record.updatedAtEpochMs)
    || record.updatedAtEpochMs < record.createdAtEpochMs
  ) return false;

  if (
    (record.status === "pending-precheck" || record.status === "precondition-mismatch" || record.status === "ready-to-write")
    && record.writeDispatchedAtEpochMs !== null
  ) return false;
  if (
    (record.status === "write-dispatched" || record.status === "verifying" || record.status === "verified" || record.status === "partial" || record.status === "mismatch")
    && record.writeDispatchedAtEpochMs === null
  ) return false;

  if (record.lease === null) return record.status !== "write-dispatched";
  if (
    typeof record.lease !== "object"
    || !safeToken(record.lease.workerId)
    || !positive(record.lease.epoch)
    || record.lease.epoch !== record.leaseEpoch
    || !positive(record.lease.expiresAtEpochMs)
  ) return false;
  return record.status === "ready-to-write" || record.status === "write-dispatched" || record.status === "verifying";
}

export function createViraDurableActionVerificationRecord(input: {
  readonly scope: ViraEnterpriseScope;
  readonly verificationId: string;
  readonly transactionId: string;
  readonly planDigest: string;
  readonly planRevision: number;
  readonly operationId: string;
  readonly executionId: string;
  readonly attemptId: string;
  readonly providerId: string;
  readonly connectionId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly createdAtEpochMs: number;
}): ViraDurableActionVerificationResult<ViraDurableActionVerificationRecord> {
  if (
    input === null
    || typeof input !== "object"
    || input.scope === null
    || typeof input.scope !== "object"
    || input.scope.version !== "1"
    || !safeToken(input.scope.organizationId)
    || !safeToken(input.scope.projectId)
    || !safeToken(input.verificationId)
    || !safeToken(input.transactionId)
    || !SHA256_HEX.test(input.planDigest)
    || !positive(input.planRevision)
    || !safeToken(input.operationId)
    || !safeToken(input.executionId)
    || !safeToken(input.attemptId)
    || !safeToken(input.providerId)
    || !safeToken(input.connectionId)
    || !safeToken(input.resourceType)
    || !safeToken(input.resourceId)
    || !positive(input.createdAtEpochMs)
  ) return fail("INVALID_INPUT", "durable action verification record input is invalid");
  return {
    ok: true,
    value: freezeRecord({
      version: VIRA_DURABLE_ACTION_VERIFICATION_VERSION,
      scope: input.scope,
      verificationId: input.verificationId,
      transactionId: input.transactionId,
      planDigest: input.planDigest,
      planRevision: input.planRevision,
      operationId: input.operationId,
      executionId: input.executionId,
      attemptId: input.attemptId,
      providerId: input.providerId,
      connectionId: input.connectionId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      revision: 1,
      status: "pending-precheck",
      leaseEpoch: 0,
      lease: null,
      beforeObservationDigest: null,
      afterObservationDigest: null,
      writeDispatchedAtEpochMs: null,
      createdAtEpochMs: input.createdAtEpochMs,
      updatedAtEpochMs: input.createdAtEpochMs,
    }),
  };
}

export function recordViraVerificationPrecheck(input: {
  readonly record: ViraDurableActionVerificationRecord;
  readonly observation?: ViraActionProviderObservation;
  readonly precondition: "match" | "mismatch" | "unavailable";
  readonly nowEpochMs: number;
}): ViraDurableActionVerificationResult<ViraDurableActionVerificationRecord> {
  if (!isViraDurableActionVerificationRecord(input.record) || input.record.status !== "pending-precheck" || !positive(input.nowEpochMs)) {
    return fail("INVALID_STATE", "verification precheck requires pending-precheck state");
  }
  if ((input.precondition === "unavailable") !== (input.observation === undefined)) {
    return fail("INVALID_INPUT", "match/mismatch require independent before-observation and unavailable must not carry one");
  }
  if (input.observation !== undefined) {
    if (!exactScope(input.record.scope, input.observation.scope)
      || input.record.providerId !== input.observation.providerId
      || input.record.connectionId !== input.observation.connectionId
      || input.record.resourceType !== input.observation.resourceType
      || input.record.resourceId !== input.observation.resourceId) {
      return fail("INVALID_INPUT", "precheck observation identity does not match verification record");
    }
  }
  const beforeDigest = input.observation?.canonicalDigest ?? null;
  const status: ViraDurableActionVerificationStatus = input.precondition === "match"
    ? "ready-to-write"
    : input.precondition === "mismatch"
      ? "precondition-mismatch"
      : "uncertain";
  return {
    ok: true,
    value: freezeRecord({
      ...input.record,
      revision: input.record.revision + 1,
      status,
      beforeObservationDigest: beforeDigest,
      updatedAtEpochMs: input.nowEpochMs,
    }),
  };
}

export function claimViraVerificationWrite(input: {
  readonly record: ViraDurableActionVerificationRecord;
  readonly workerId: string;
  readonly expectedRevision: number;
  readonly nowEpochMs: number;
  readonly leaseMs: number;
}): ViraDurableActionVerificationResult<ViraDurableActionVerificationRecord> {
  const record = input.record;
  if (!isViraDurableActionVerificationRecord(record) || record.status !== "ready-to-write") {
    return fail("INVALID_STATE", "write claim requires ready-to-write state");
  }
  if (record.revision !== input.expectedRevision) return fail("STALE_REVISION", "write claim revision is stale");
  if (!safeToken(input.workerId) || !positive(input.nowEpochMs) || !positive(input.leaseMs) || input.leaseMs > MAX_LEASE_MS) {
    return fail("INVALID_INPUT", "write claim input is invalid");
  }
  if (record.lease !== null && record.lease.expiresAtEpochMs > input.nowEpochMs) return fail("STALE_LEASE", "write claim already has a live lease");
  const epoch = record.leaseEpoch + 1;
  return {
    ok: true,
    value: freezeRecord({
      ...record,
      revision: record.revision + 1,
      leaseEpoch: epoch,
      lease: Object.freeze({ workerId: input.workerId, epoch, expiresAtEpochMs: input.nowEpochMs + input.leaseMs }),
      updatedAtEpochMs: input.nowEpochMs,
    }),
  };
}

export function claimViraVerificationReadback(input: {
  readonly record: ViraDurableActionVerificationRecord;
  readonly workerId: string;
  readonly expectedRevision: number;
  readonly nowEpochMs: number;
  readonly leaseMs: number;
}): ViraDurableActionVerificationResult<ViraDurableActionVerificationRecord> {
  const record = input.record;
  if (!isViraDurableActionVerificationRecord(record) || record.status !== "verifying" || record.lease !== null || record.writeDispatchedAtEpochMs === null) {
    return fail("INVALID_STATE", "readback claim requires recovered verifying state after write dispatch");
  }
  if (record.revision !== input.expectedRevision) return fail("STALE_REVISION", "readback claim revision is stale");
  if (!safeToken(input.workerId) || !positive(input.nowEpochMs) || !positive(input.leaseMs) || input.leaseMs > MAX_LEASE_MS) {
    return fail("INVALID_INPUT", "readback claim input is invalid");
  }
  const epoch = record.leaseEpoch + 1;
  return {
    ok: true,
    value: freezeRecord({
      ...record,
      revision: record.revision + 1,
      leaseEpoch: epoch,
      lease: Object.freeze({ workerId: input.workerId, epoch, expiresAtEpochMs: input.nowEpochMs + input.leaseMs }),
      updatedAtEpochMs: input.nowEpochMs,
    }),
  };
}

function currentLease(input: {
  readonly record: ViraDurableActionVerificationRecord;
  readonly workerId: string;
  readonly leaseEpoch: number;
  readonly expectedRevision: number;
  readonly nowEpochMs: number;
}): ViraDurableActionVerificationIssue | undefined {
  const record = input.record;
  if (!isViraDurableActionVerificationRecord(record)) return { code: "INVALID_STATE", message: "verification record is invalid" };
  if (record.revision !== input.expectedRevision) return { code: "STALE_REVISION", message: "verification revision is stale" };
  if (record.lease === null
    || record.lease.workerId !== input.workerId
    || record.lease.epoch !== input.leaseEpoch
    || record.leaseEpoch !== input.leaseEpoch
    || record.lease.expiresAtEpochMs <= input.nowEpochMs) {
    return { code: "STALE_LEASE", message: "verification lease is stale" };
  }
  return undefined;
}

export function markViraVerificationWriteDispatched(input: {
  readonly record: ViraDurableActionVerificationRecord;
  readonly workerId: string;
  readonly leaseEpoch: number;
  readonly expectedRevision: number;
  readonly nowEpochMs: number;
}): ViraDurableActionVerificationResult<ViraDurableActionVerificationRecord> {
  const issue = currentLease(input);
  if (issue) return { ok: false, issue };
  if (input.record.status !== "ready-to-write") return fail("INVALID_STATE", "dispatch requires ready-to-write state");
  return {
    ok: true,
    value: freezeRecord({
      ...input.record,
      revision: input.record.revision + 1,
      status: "write-dispatched",
      writeDispatchedAtEpochMs: input.nowEpochMs,
      updatedAtEpochMs: input.nowEpochMs,
    }),
  };
}

export function beginViraPostconditionVerification(input: {
  readonly record: ViraDurableActionVerificationRecord;
  readonly workerId: string;
  readonly leaseEpoch: number;
  readonly expectedRevision: number;
  readonly nowEpochMs: number;
}): ViraDurableActionVerificationResult<ViraDurableActionVerificationRecord> {
  const issue = currentLease(input);
  if (issue) return { ok: false, issue };
  if (input.record.status !== "write-dispatched") return fail("INVALID_STATE", "postcondition verification requires write-dispatched state");
  return {
    ok: true,
    value: freezeRecord({
      ...input.record,
      revision: input.record.revision + 1,
      status: "verifying",
      updatedAtEpochMs: input.nowEpochMs,
    }),
  };
}

export function completeViraPostconditionVerification(input: {
  readonly record: ViraDurableActionVerificationRecord;
  readonly workerId: string;
  readonly leaseEpoch: number;
  readonly expectedRevision: number;
  readonly nowEpochMs: number;
  readonly observation?: ViraActionProviderObservation;
  readonly status: ViraActionPostconditionStatus;
}): ViraDurableActionVerificationResult<ViraDurableActionVerificationRecord> {
  const issue = currentLease(input);
  if (issue) return { ok: false, issue };
  if (input.record.status !== "verifying") return fail("INVALID_STATE", "completion requires verifying state");
  if ((input.status === "uncertain") !== (input.observation === undefined)) {
    return fail("INVALID_INPUT", "verified/partial/mismatch require independent after-observation and uncertain must not carry one");
  }
  if (input.observation !== undefined) {
    if (!exactScope(input.record.scope, input.observation.scope)
      || input.record.providerId !== input.observation.providerId
      || input.record.connectionId !== input.observation.connectionId
      || input.record.resourceType !== input.observation.resourceType
      || input.record.resourceId !== input.observation.resourceId) {
      return fail("INVALID_INPUT", "postcondition observation identity does not match verification record");
    }
  }
  return {
    ok: true,
    value: freezeRecord({
      ...input.record,
      revision: input.record.revision + 1,
      status: input.status,
      lease: null,
      afterObservationDigest: input.observation?.canonicalDigest ?? null,
      updatedAtEpochMs: input.nowEpochMs,
    }),
  };
}

export function recoverViraVerificationAfterLeaseExpiry(input: {
  readonly record: ViraDurableActionVerificationRecord;
  readonly expectedRevision: number;
  readonly nowEpochMs: number;
}): ViraDurableActionVerificationResult<ViraDurableActionVerificationRecord> {
  const record = input.record;
  if (!isViraDurableActionVerificationRecord(record) || record.revision !== input.expectedRevision || !positive(input.nowEpochMs)) {
    return fail(record?.revision !== input.expectedRevision ? "STALE_REVISION" : "INVALID_INPUT", "verification recovery input is invalid");
  }
  if (record.lease === null || record.lease.expiresAtEpochMs > input.nowEpochMs) return fail("STALE_LEASE", "verification lease is still live or absent");
  const status: ViraDurableActionVerificationStatus = record.writeDispatchedAtEpochMs === null
    ? "ready-to-write"
    : "verifying";
  return {
    ok: true,
    value: freezeRecord({
      ...record,
      revision: record.revision + 1,
      status,
      lease: null,
      updatedAtEpochMs: input.nowEpochMs,
    }),
  };
}