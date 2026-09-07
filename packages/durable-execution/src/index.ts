import {
  VIRA_TRANSACTION_EXECUTION_AUDIENCE,
  verifyViraTransactionExecutionGrant,
  type ViraFrozenTransactionPlan,
  type ViraSignedTransactionExecutionGrant,
  type ViraTransactionGrantVerifier,
} from "@vira-enterprise-genui/action-transaction";
import type { ViraEnterpriseScope, ViraSecretRef } from "@vira-enterprise-genui/enterprise-context";
import type { JsonObject } from "@vira-enterprise-genui/protocol";

export const VIRA_DURABLE_EXECUTION_VERSION = "1" as const;
export const VIRA_DURABLE_EXECUTION_STATUSES = Object.freeze([
  "queued",
  "executing",
  "verifying",
  "partial",
  "mismatch",
  "uncertain",
  "recovery",
  "manual",
] as const);
export const VIRA_DURABLE_EXECUTION_DISPATCH_STATES = Object.freeze(["not-started", "started"] as const);
export const VIRA_DURABLE_EXECUTION_MAX_LEASE_MS = 5 * 60 * 1_000;

export type ViraDurableExecutionStatus = (typeof VIRA_DURABLE_EXECUTION_STATUSES)[number];
export type ViraDurableExecutionDispatchState = (typeof VIRA_DURABLE_EXECUTION_DISPATCH_STATES)[number];

export interface ViraDurableExecutionLease {
  readonly workerId: string;
  readonly epoch: number;
  readonly expiresAtEpochMs: number;
}

export interface ViraDurableExecutionRecord {
  readonly version: typeof VIRA_DURABLE_EXECUTION_VERSION;
  readonly executionId: string;
  readonly scope: ViraEnterpriseScope;
  readonly transactionId: string;
  readonly planDigest: string;
  readonly planRevision: number;
  readonly operationId: string;
  readonly grantId: string;
  readonly grantNonce: string;
  readonly idempotencyKey: string;
  readonly revision: number;
  readonly status: ViraDurableExecutionStatus;
  readonly leaseEpoch: number;
  readonly lease: ViraDurableExecutionLease | null;
  readonly dispatchState: ViraDurableExecutionDispatchState;
  readonly createdAtEpochMs: number;
  readonly updatedAtEpochMs: number;
}

export interface ViraCreateDurableExecutionInput {
  readonly executionId: string;
  readonly frozen: ViraFrozenTransactionPlan;
  readonly grant: ViraSignedTransactionExecutionGrant;
  readonly operationId: string;
  readonly createdAtEpochMs: number;
}

export interface ViraClaimDurableExecutionInput {
  readonly record: ViraDurableExecutionRecord;
  readonly workerId: string;
  readonly nowEpochMs: number;
  readonly leaseMs: number;
}

export interface ViraRenewDurableExecutionLeaseInput {
  readonly record: ViraDurableExecutionRecord;
  readonly workerId: string;
  readonly leaseEpoch: number;
  readonly expectedRevision: number;
  readonly nowEpochMs: number;
  readonly leaseMs: number;
}

export type ViraDurableExecutionStageBRejectCode =
  | "NOT_FOUND"
  | "STALE_REVISION"
  | "STALE_LEASE"
  | "NONCE_REPLAY"
  | "IDEMPOTENCY_CONFLICT"
  | "EFFECT_CONFLICT";

export type ViraDurableExecutionStageBConsumeResult =
  | {
      readonly ok: true;
      readonly value: {
        readonly revision: number;
        readonly reservationId: string;
      };
    }
  | {
      readonly ok: false;
      readonly code: ViraDurableExecutionStageBRejectCode;
    };

export interface ViraDurableExecutionStageBStore {
  readonly consumeGrantAndReserveEffect: (input: {
    readonly scope: ViraEnterpriseScope;
    readonly executionId: string;
    readonly expectedRevision: number;
    readonly workerId: string;
    readonly leaseEpoch: number;
    readonly transactionId: string;
    readonly planDigest: string;
    readonly planRevision: number;
    readonly operationId: string;
    readonly grantId: string;
    readonly nonce: string;
    readonly nonceExpiresAtEpochMs: number;
    readonly idempotencyKey: string;
  }) => Promise<ViraDurableExecutionStageBConsumeResult> | ViraDurableExecutionStageBConsumeResult;
}

export interface ViraDurableExecutionStageBPermit {
  readonly version: typeof VIRA_DURABLE_EXECUTION_VERSION;
  readonly executionId: string;
  readonly scope: ViraEnterpriseScope;
  readonly transactionId: string;
  readonly planDigest: string;
  readonly planRevision: number;
  readonly operationId: string;
  readonly actionRef: Readonly<{ readonly id: string; readonly versionRef: string }>;
  readonly actionIntent: JsonObject;
  readonly providerId: string;
  readonly connectionId: string;
  readonly adapterRef: string;
  readonly runnerRef: string;
  readonly secretRef: ViraSecretRef;
  readonly idempotencyKey: string;
  readonly grantId: string;
  readonly grantNonce: string;
  readonly reservationId: string;
  readonly reservationRevision: number;
  readonly workerId: string;
  readonly leaseEpoch: number;
  readonly expiresAtEpochMs: number;
}

export interface ViraConsumeDurableExecutionStageBInput {
  readonly record: ViraDurableExecutionRecord;
  readonly frozen: ViraFrozenTransactionPlan;
  readonly grant: ViraSignedTransactionExecutionGrant;
  readonly operationId: string;
  readonly workerId: string;
  readonly leaseEpoch: number;
  readonly expectedRevision: number;
  readonly nowEpochMs: number;
  readonly verifier: ViraTransactionGrantVerifier;
  readonly store: ViraDurableExecutionStageBStore;
}

export type ViraDurableExecutionIssueCode =
  | "INVALID_INPUT"
  | "PLAN_MISMATCH"
  | "GRANT_MISMATCH"
  | "UNKNOWN_OPERATION"
  | "INVALID_STATE"
  | "STALE_REVISION"
  | "STALE_LEASE"
  | "GRANT_REJECTED"
  | "AUTHORITY_STORE_FAILED"
  | "AUTHORITY_REJECTED";

export interface ViraDurableExecutionIssue {
  readonly code: ViraDurableExecutionIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraDurableExecutionResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: ViraDurableExecutionIssue };

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;

function fail<T>(code: ViraDurableExecutionIssueCode, path: string, message: string): ViraDurableExecutionResult<T> {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function safeToken(value: unknown): value is string {
  return typeof value === "string" && SAFE_TOKEN.test(value) && value.trim() === value;
}

function safePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function safeNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validScope(value: unknown): value is ViraEnterpriseScope {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const scope = value as Partial<ViraEnterpriseScope>;
  return scope.version === "1"
    && safeToken(scope.organizationId)
    && safeToken(scope.projectId)
    && (scope.environment === "dev" || scope.environment === "staging" || scope.environment === "production");
}

function validLease(value: unknown, leaseEpoch: number): value is ViraDurableExecutionLease | null {
  if (value === null) return true;
  if (typeof value !== "object" || Array.isArray(value)) return false;
  const lease = value as Partial<ViraDurableExecutionLease>;
  return safeToken(lease.workerId)
    && safePositive(lease.epoch)
    && lease.epoch === leaseEpoch
    && safePositive(lease.expiresAtEpochMs);
}

export function isViraDurableExecutionRecord(record: unknown): record is ViraDurableExecutionRecord {
  if (record === null || typeof record !== "object" || Array.isArray(record)) return false;
  const candidate = record as Partial<ViraDurableExecutionRecord>;
  if (
    candidate.version !== VIRA_DURABLE_EXECUTION_VERSION
    || !safeToken(candidate.executionId)
    || !validScope(candidate.scope)
    || !safeToken(candidate.transactionId)
    || typeof candidate.planDigest !== "string"
    || !SHA256_HEX.test(candidate.planDigest)
    || !safePositive(candidate.planRevision)
    || !safeToken(candidate.operationId)
    || !safeToken(candidate.grantId)
    || !safeToken(candidate.grantNonce)
    || !safeToken(candidate.idempotencyKey)
    || !safePositive(candidate.revision)
    || !safeNonNegative(candidate.leaseEpoch)
    || candidate.status === undefined
    || !VIRA_DURABLE_EXECUTION_STATUSES.includes(candidate.status)
    || candidate.dispatchState === undefined
    || !VIRA_DURABLE_EXECUTION_DISPATCH_STATES.includes(candidate.dispatchState)
    || !safePositive(candidate.createdAtEpochMs)
    || !safePositive(candidate.updatedAtEpochMs)
    || candidate.updatedAtEpochMs < candidate.createdAtEpochMs
    || !validLease(candidate.lease, candidate.leaseEpoch)
  ) return false;
  return candidate.status === "executing" ? candidate.lease !== null : candidate.lease === null;
}

function exactScope(left: ViraEnterpriseScope, right: ViraEnterpriseScope): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function frozenScope(scope: ViraEnterpriseScope): ViraEnterpriseScope {
  return Object.freeze({
    version: scope.version,
    organizationId: scope.organizationId,
    projectId: scope.projectId,
    environment: scope.environment,
  });
}

function frozenSecretRef(secret: ViraSecretRef): ViraSecretRef {
  return Object.freeze({
    version: secret.version,
    organizationId: secret.organizationId,
    projectId: secret.projectId,
    environment: secret.environment,
    provider: secret.provider,
    key: secret.key,
    ...(secret.versionRef === undefined ? {} : { versionRef: secret.versionRef }),
  });
}

function cloneJson<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((entry) => cloneJson(entry)) as T;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, cloneJson(entry)]),
  ) as T;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const entry of value) deepFreeze(entry);
    return Object.freeze(value) as T;
  }
  for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry);
  return Object.freeze(value);
}

function exactPlanCoordinates(
  frozen: ViraFrozenTransactionPlan,
  value: { readonly transactionId: string; readonly planDigest: string; readonly planRevision: number },
): boolean {
  return value.transactionId === frozen.plan.transactionId
    && value.planDigest === frozen.planDigest
    && value.planRevision === frozen.planRevision;
}

function operationById(frozen: ViraFrozenTransactionPlan, operationId: string) {
  return frozen.plan.operations.find((operation) => operation.operationId === operationId);
}

export function createViraDurableExecutionRecord(
  input: ViraCreateDurableExecutionInput,
): ViraDurableExecutionResult<ViraDurableExecutionRecord> {
  if (
    input === null
    || typeof input !== "object"
    || !safeToken(input.executionId)
    || !safeToken(input.operationId)
    || !safePositive(input.createdAtEpochMs)
  ) return fail("INVALID_INPUT", "$", "durable execution input is invalid");

  const operation = operationById(input.frozen, input.operationId);
  if (!operation) return fail("UNKNOWN_OPERATION", "$.operationId", "operation is not present in the frozen TransactionPlan");
  if (
    !exactPlanCoordinates(input.frozen, input.grant.payload)
    || !exactScope(input.grant.payload.scope, input.frozen.plan.scope)
    || input.grant.payload.operationId !== operation.operationId
  ) return fail("GRANT_MISMATCH", "$.grant", "execution grant does not bind the exact frozen operation");
  if (!safeToken(input.grant.payload.grantId) || !safeToken(input.grant.payload.nonce)) {
    return fail("GRANT_MISMATCH", "$.grant.payload", "execution grant identity is invalid");
  }

  return {
    ok: true,
    value: deepFreeze({
      version: VIRA_DURABLE_EXECUTION_VERSION,
      executionId: input.executionId,
      scope: frozenScope(input.frozen.plan.scope),
      transactionId: input.frozen.plan.transactionId,
      planDigest: input.frozen.planDigest,
      planRevision: input.frozen.planRevision,
      operationId: operation.operationId,
      grantId: input.grant.payload.grantId,
      grantNonce: input.grant.payload.nonce,
      idempotencyKey: operation.idempotencyKey,
      revision: 1,
      status: "queued",
      leaseEpoch: 0,
      lease: null,
      dispatchState: "not-started",
      createdAtEpochMs: input.createdAtEpochMs,
      updatedAtEpochMs: input.createdAtEpochMs,
    }),
  };
}

export function claimViraDurableExecution(
  input: ViraClaimDurableExecutionInput,
): ViraDurableExecutionResult<ViraDurableExecutionRecord> {
  const { record } = input;
  if (
    !isViraDurableExecutionRecord(record)
    || !safeToken(input.workerId)
    || !safePositive(input.nowEpochMs)
    || !safePositive(input.leaseMs)
    || input.leaseMs > VIRA_DURABLE_EXECUTION_MAX_LEASE_MS
  ) return fail("INVALID_INPUT", "$", "durable execution claim input is invalid");
  if (record.status !== "queued" && record.status !== "recovery") {
    return fail("INVALID_STATE", "$.record.status", "only queued or recovery execution may be claimed");
  }
  if (record.lease !== null && record.lease.expiresAtEpochMs > input.nowEpochMs) {
    return fail("STALE_LEASE", "$.record.lease", "execution still has a live worker lease");
  }

  const epoch = record.leaseEpoch + 1;
  return {
    ok: true,
    value: deepFreeze({
      ...record,
      revision: record.revision + 1,
      status: "executing",
      leaseEpoch: epoch,
      lease: {
        workerId: input.workerId,
        epoch,
        expiresAtEpochMs: input.nowEpochMs + input.leaseMs,
      },
      updatedAtEpochMs: input.nowEpochMs,
    }),
  };
}

export function renewViraDurableExecutionLease(
  input: ViraRenewDurableExecutionLeaseInput,
): ViraDurableExecutionResult<ViraDurableExecutionRecord> {
  const { record } = input;
  if (
    !isViraDurableExecutionRecord(record)
    || !safeToken(input.workerId)
    || !safePositive(input.nowEpochMs)
    || !safePositive(input.leaseMs)
    || input.leaseMs > VIRA_DURABLE_EXECUTION_MAX_LEASE_MS
    || !safePositive(input.expectedRevision)
    || !safePositive(input.leaseEpoch)
  ) return fail("INVALID_INPUT", "$", "durable execution lease renewal input is invalid");
  if (record.revision !== input.expectedRevision) {
    return fail("STALE_REVISION", "$.expectedRevision", "durable execution revision changed before lease renewal");
  }
  if (
    record.status !== "executing"
    || record.lease === null
    || record.lease.workerId !== input.workerId
    || record.lease.epoch !== input.leaseEpoch
    || record.leaseEpoch !== input.leaseEpoch
    || record.lease.expiresAtEpochMs <= input.nowEpochMs
  ) return fail("STALE_LEASE", "$.record.lease", "worker no longer owns the current live lease");

  return {
    ok: true,
    value: deepFreeze({
      ...record,
      revision: record.revision + 1,
      lease: {
        workerId: input.workerId,
        epoch: input.leaseEpoch,
        expiresAtEpochMs: input.nowEpochMs + input.leaseMs,
      },
      updatedAtEpochMs: input.nowEpochMs,
    }),
  };
}

function validateStageBCoordinates(
  input: ViraConsumeDurableExecutionStageBInput,
): ViraDurableExecutionResult<ReturnType<typeof operationById> & {}> {
  if (
    input === null
    || typeof input !== "object"
    || !isViraDurableExecutionRecord(input.record)
    || !safeToken(input.operationId)
    || !safeToken(input.workerId)
    || !safePositive(input.leaseEpoch)
    || !safePositive(input.expectedRevision)
    || !safePositive(input.nowEpochMs)
    || input.verifier === null
    || typeof input.verifier !== "object"
    || typeof input.verifier.verify !== "function"
    || input.store === null
    || typeof input.store !== "object"
    || typeof input.store.consumeGrantAndReserveEffect !== "function"
  ) return fail("INVALID_INPUT", "$", "Stage B input is invalid");

  const operation = operationById(input.frozen, input.operationId);
  if (!operation) return fail("UNKNOWN_OPERATION", "$.operationId", "Stage B operation is not in the frozen plan");
  if (
    !exactPlanCoordinates(input.frozen, input.record)
    || !exactScope(input.record.scope, input.frozen.plan.scope)
    || input.record.operationId !== operation.operationId
    || input.record.idempotencyKey !== operation.idempotencyKey
  ) return fail("PLAN_MISMATCH", "$.record", "durable execution record does not bind the exact frozen operation");
  if (
    !exactPlanCoordinates(input.frozen, input.grant.payload)
    || !exactScope(input.grant.payload.scope, input.frozen.plan.scope)
    || input.grant.payload.operationId !== operation.operationId
    || input.grant.payload.grantId !== input.record.grantId
    || input.grant.payload.nonce !== input.record.grantNonce
  ) return fail("GRANT_MISMATCH", "$.grant", "Stage B grant does not bind the queued durable execution");
  if (input.record.revision !== input.expectedRevision) {
    return fail("STALE_REVISION", "$.expectedRevision", "durable execution revision changed before Stage B consumption");
  }
  if (
    input.record.status !== "executing"
    || input.record.lease === null
    || input.record.lease.workerId !== input.workerId
    || input.record.lease.epoch !== input.leaseEpoch
    || input.record.leaseEpoch !== input.leaseEpoch
    || input.record.lease.expiresAtEpochMs <= input.nowEpochMs
  ) return fail("STALE_LEASE", "$.record.lease", "Stage B requires the current live fenced worker lease");
  return { ok: true, value: operation } as ViraDurableExecutionResult<ReturnType<typeof operationById> & {}>;
}

export async function consumeViraDurableExecutionStageB(
  input: ViraConsumeDurableExecutionStageBInput,
): Promise<ViraDurableExecutionResult<ViraDurableExecutionStageBPermit>> {
  const validated = validateStageBCoordinates(input);
  if (!validated.ok) return validated;
  const operation = validated.value;

  let consumed: { readonly revision: number; readonly reservationId: string } | undefined;
  let storeFailure = false;

  const verified = await verifyViraTransactionExecutionGrant({
    frozen: input.frozen,
    grant: input.grant,
    operationId: input.operationId,
    audience: VIRA_TRANSACTION_EXECUTION_AUDIENCE,
    nowEpochMs: input.nowEpochMs,
    verifier: input.verifier,
    replayGuard: {
      async accept(replay) {
        let result: ViraDurableExecutionStageBConsumeResult;
        try {
          result = await input.store.consumeGrantAndReserveEffect({
            scope: replay.scope,
            executionId: input.record.executionId,
            expectedRevision: input.expectedRevision,
            workerId: input.workerId,
            leaseEpoch: input.leaseEpoch,
            transactionId: input.record.transactionId,
            planDigest: input.record.planDigest,
            planRevision: input.record.planRevision,
            operationId: operation.operationId,
            grantId: replay.grantId,
            nonce: replay.nonce,
            nonceExpiresAtEpochMs: replay.expiresAtEpochMs,
            idempotencyKey: operation.idempotencyKey,
          });
        } catch {
          storeFailure = true;
          throw new Error("durable Stage B authority store failed");
        }
        if (!result.ok) return false;
        if (!safePositive(result.value.revision) || !safeToken(result.value.reservationId)) {
          storeFailure = true;
          throw new Error("durable Stage B authority store returned invalid evidence");
        }
        consumed = Object.freeze({ revision: result.value.revision, reservationId: result.value.reservationId });
        return true;
      },
    },
  });

  if (!verified.ok) {
    if (storeFailure || verified.issue.code === "REPLAY_GUARD_FAILED") {
      return fail("AUTHORITY_STORE_FAILED", "$.store", "Stage B authority store failed closed");
    }
    if (verified.issue.code === "REPLAY_REJECTED") {
      return fail("AUTHORITY_REJECTED", "$.grant.payload.nonce", "grant nonce or effect reservation was already consumed");
    }
    return fail("GRANT_REJECTED", "$.grant", `execution grant verification failed: ${verified.issue.code}`);
  }
  if (consumed === undefined) {
    return fail("AUTHORITY_STORE_FAILED", "$.store", "Stage B verification completed without durable reservation evidence");
  }

  const permit: ViraDurableExecutionStageBPermit = {
    version: VIRA_DURABLE_EXECUTION_VERSION,
    executionId: input.record.executionId,
    scope: frozenScope(input.record.scope),
    transactionId: input.record.transactionId,
    planDigest: input.record.planDigest,
    planRevision: input.record.planRevision,
    operationId: operation.operationId,
    actionRef: Object.freeze({ id: operation.actionRef.id, versionRef: operation.actionRef.versionRef }),
    actionIntent: deepFreeze(cloneJson(operation.actionIntent)),
    providerId: operation.providerId,
    connectionId: operation.connectionId,
    adapterRef: operation.adapterRef,
    runnerRef: operation.runnerRef,
    secretRef: frozenSecretRef(operation.secretRef),
    idempotencyKey: operation.idempotencyKey,
    grantId: input.record.grantId,
    grantNonce: input.record.grantNonce,
    reservationId: consumed.reservationId,
    reservationRevision: consumed.revision,
    workerId: input.workerId,
    leaseEpoch: input.leaseEpoch,
    expiresAtEpochMs: Math.min(input.grant.payload.expiresAtEpochMs, input.record.lease!.expiresAtEpochMs),
  };
  return { ok: true, value: deepFreeze(permit) };
}
