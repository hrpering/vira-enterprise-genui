import { createHash } from "node:crypto";
import {
  claimViraVerificationReadback,
  claimViraVerificationWrite,
  completeViraPostconditionVerification,
  isViraDurableActionVerificationRecord,
  markViraVerificationWriteDispatched,
  beginViraPostconditionVerification,
  recordViraVerificationPrecheck,
  recoverViraVerificationAfterLeaseExpiry,
  type ViraDurableActionVerificationRecord,
} from "../../../packages/action-verification/src/durable.js";
import type {
  ViraActionPostconditionStatus,
  ViraActionProviderObservation,
} from "../../../packages/action-verification/src/index.js";
import type { ViraEnterpriseScope } from "../../../packages/enterprise-context/src/index.js";
import { parseJsonValue, type JsonObject, type JsonValue } from "../../../packages/protocol/src/index.js";
import {
  canonicalizeEnterpriseScope,
  withTenantTransaction,
  type PostgresClientLike,
  type PostgresPoolLike,
} from "./transaction.js";

interface VerificationRow extends Record<string, unknown> {
  readonly organization_id: unknown;
  readonly project_id: unknown;
  readonly environment: unknown;
  readonly verification_id: unknown;
  readonly transaction_id: unknown;
  readonly plan_digest: unknown;
  readonly plan_revision: unknown;
  readonly operation_id: unknown;
  readonly execution_id: unknown;
  readonly attempt_id: unknown;
  readonly provider_id: unknown;
  readonly connection_id: unknown;
  readonly resource_type: unknown;
  readonly resource_id: unknown;
  readonly revision: unknown;
  readonly status: unknown;
  readonly lease_epoch: unknown;
  readonly record: unknown;
}

interface EpochRow extends Record<string, unknown> {
  readonly now_epoch_ms: unknown;
}

export type ViraPostgresActionVerificationMutationCode =
  | "ALREADY_EXISTS"
  | "NOT_FOUND"
  | "VERSION_CONFLICT"
  | "INVALID_STATE";

export type ViraPostgresActionVerificationMutationResult =
  | { readonly ok: true; readonly value: ViraDurableActionVerificationRecord }
  | { readonly ok: false; readonly code: ViraPostgresActionVerificationMutationCode };

export interface ViraPostgresActionVerificationStore {
  readonly read: (
    scope: ViraEnterpriseScope,
    verificationId: string,
  ) => Promise<ViraDurableActionVerificationRecord | undefined>;
  readonly create: (
    record: ViraDurableActionVerificationRecord,
  ) => Promise<ViraPostgresActionVerificationMutationResult>;
  readonly recordPrecheck: (input: {
    readonly scope: ViraEnterpriseScope;
    readonly verificationId: string;
    readonly expectedRevision: number;
    readonly precondition: "match" | "mismatch" | "unavailable";
    readonly observation?: ViraActionProviderObservation;
  }) => Promise<ViraPostgresActionVerificationMutationResult>;
  readonly claimWrite: (input: {
    readonly scope: ViraEnterpriseScope;
    readonly verificationId: string;
    readonly workerId: string;
    readonly expectedRevision: number;
    readonly leaseMs: number;
  }) => Promise<ViraPostgresActionVerificationMutationResult>;
  readonly markWriteDispatched: (input: {
    readonly scope: ViraEnterpriseScope;
    readonly verificationId: string;
    readonly workerId: string;
    readonly leaseEpoch: number;
    readonly expectedRevision: number;
  }) => Promise<ViraPostgresActionVerificationMutationResult>;
  readonly beginPostcondition: (input: {
    readonly scope: ViraEnterpriseScope;
    readonly verificationId: string;
    readonly workerId: string;
    readonly leaseEpoch: number;
    readonly expectedRevision: number;
  }) => Promise<ViraPostgresActionVerificationMutationResult>;
  readonly claimReadback: (input: {
    readonly scope: ViraEnterpriseScope;
    readonly verificationId: string;
    readonly workerId: string;
    readonly expectedRevision: number;
    readonly leaseMs: number;
  }) => Promise<ViraPostgresActionVerificationMutationResult>;
  readonly completePostcondition: (input: {
    readonly scope: ViraEnterpriseScope;
    readonly verificationId: string;
    readonly workerId: string;
    readonly leaseEpoch: number;
    readonly expectedRevision: number;
    readonly status: ViraActionPostconditionStatus;
    readonly observation?: ViraActionProviderObservation;
  }) => Promise<ViraPostgresActionVerificationMutationResult>;
  readonly recoverExpired: (input: {
    readonly scope: ViraEnterpriseScope;
    readonly verificationId: string;
    readonly expectedRevision: number;
  }) => Promise<ViraPostgresActionVerificationMutationResult>;
}

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/;
const RECORD_FIELDS = new Set([
  "version", "scope", "verificationId", "transactionId", "planDigest", "planRevision",
  "operationId", "executionId", "attemptId", "providerId", "connectionId", "resourceType",
  "resourceId", "revision", "status", "leaseEpoch", "lease", "beforeObservationDigest",
  "afterObservationDigest", "writeDispatchedAtEpochMs", "createdAtEpochMs", "updatedAtEpochMs",
]);

class MutationConflict extends Error {
  readonly code: ViraPostgresActionVerificationMutationCode;

  constructor(code: ViraPostgresActionVerificationMutationCode) {
    super(code);
    this.name = "MutationConflict";
    this.code = code;
  }
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactFields(value: JsonObject, expected: ReadonlySet<string>): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.size && keys.every((key) => expected.has(key));
}

function safeToken(value: unknown): value is string {
  return typeof value === "string" && SAFE_TOKEN.test(value) && value.trim() === value;
}

function rowInteger(value: unknown, allowZero = false): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && (allowZero ? value >= 0 : value >= 1)) return value;
  if (typeof value === "string" && /^(?:0|[1-9][0-9]*)$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && (allowZero ? parsed >= 0 : parsed >= 1)) return parsed;
  }
  throw new TypeError("PostgreSQL action verification integer is invalid");
}

function exactScope(left: ViraEnterpriseScope, right: ViraEnterpriseScope): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function parseVerificationRecord(input: unknown): ViraDurableActionVerificationRecord {
  const parsed = parseJsonValue(input, "$.record");
  if (!parsed.ok || !isObject(parsed.value) || !exactFields(parsed.value, RECORD_FIELDS)) {
    throw new TypeError("PostgreSQL action verification record must be canonical exact-shape JSON");
  }
  if (!isViraDurableActionVerificationRecord(parsed.value)) {
    throw new TypeError("PostgreSQL action verification record is invalid");
  }
  return Object.freeze({
    ...parsed.value,
    scope: canonicalizeEnterpriseScope(parsed.value.scope),
    lease: parsed.value.lease === null ? null : Object.freeze({ ...parsed.value.lease }),
  }) as unknown as ViraDurableActionVerificationRecord;
}

function validateRow(
  row: VerificationRow,
  expectedScope: ViraEnterpriseScope,
  expectedVerificationId: string,
): ViraDurableActionVerificationRecord {
  const record = parseVerificationRecord(row.record);
  const rowScope = canonicalizeEnterpriseScope({
    version: "1",
    organizationId: row.organization_id,
    projectId: row.project_id,
    environment: row.environment,
  });
  if (
    !exactScope(record.scope, expectedScope)
    || !exactScope(rowScope, expectedScope)
    || record.verificationId !== expectedVerificationId
    || row.verification_id !== record.verificationId
    || row.transaction_id !== record.transactionId
    || row.plan_digest !== record.planDigest
    || rowInteger(row.plan_revision) !== record.planRevision
    || row.operation_id !== record.operationId
    || row.execution_id !== record.executionId
    || row.attempt_id !== record.attemptId
    || row.provider_id !== record.providerId
    || row.connection_id !== record.connectionId
    || row.resource_type !== record.resourceType
    || row.resource_id !== record.resourceId
    || rowInteger(row.revision) !== record.revision
    || row.status !== record.status
    || rowInteger(row.lease_epoch, true) !== record.leaseEpoch
  ) throw new TypeError("PostgreSQL action verification row/record identity drifted");
  return record;
}

async function dbNowEpochMs(client: PostgresClientLike): Promise<number> {
  const result = await client.query<EpochRow>(
    "SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS now_epoch_ms",
  );
  if (result.rows.length !== 1) throw new TypeError("PostgreSQL action verification DB clock is unavailable");
  return rowInteger(result.rows[0]!.now_epoch_ms);
}

async function lockedRecord(
  client: PostgresClientLike,
  scope: ViraEnterpriseScope,
  verificationId: string,
): Promise<ViraDurableActionVerificationRecord> {
  if (!safeToken(verificationId)) throw new TypeError("PostgreSQL action verification id is invalid");
  const result = await client.query<VerificationRow>(
    `SELECT organization_id, project_id, environment, verification_id, transaction_id, plan_digest,
      plan_revision, operation_id, execution_id, attempt_id, provider_id, connection_id, resource_type,
      resource_id, revision, status, lease_epoch, record
     FROM vira.action_verification_state
     WHERE organization_id = $1 AND project_id = $2 AND environment = $3 AND verification_id = $4
     FOR UPDATE`,
    [scope.organizationId, scope.projectId, scope.environment, verificationId],
  );
  if (result.rows.length === 0) throw new MutationConflict("NOT_FOUND");
  if (result.rows.length !== 1) throw new TypeError("PostgreSQL action verification identity is not unique");
  return validateRow(result.rows[0]!, scope, verificationId);
}

async function persistCas(
  client: PostgresClientLike,
  scope: ViraEnterpriseScope,
  record: ViraDurableActionVerificationRecord,
  expectedRevision: number,
): Promise<void> {
  const result = await client.query(
    `UPDATE vira.action_verification_state
     SET revision = $5,
         status = $6,
         lease_epoch = $7,
         lease_worker_id = $8,
         lease_expires_at = $9,
         before_observation_digest = $10,
         after_observation_digest = $11,
         write_dispatched_at = $12,
         record = $13::jsonb,
         persistence_updated_at = clock_timestamp()
     WHERE organization_id = $1 AND project_id = $2 AND environment = $3
       AND verification_id = $4 AND revision = $14`,
    [
      scope.organizationId,
      scope.projectId,
      scope.environment,
      record.verificationId,
      record.revision,
      record.status,
      record.leaseEpoch,
      record.lease?.workerId ?? null,
      record.lease === null ? null : new Date(record.lease.expiresAtEpochMs),
      record.beforeObservationDigest,
      record.afterObservationDigest,
      record.writeDispatchedAtEpochMs === null ? null : new Date(record.writeDispatchedAtEpochMs),
      JSON.stringify(record),
      expectedRevision,
    ],
  );
  if (result.rowCount !== 1) throw new MutationConflict("VERSION_CONFLICT");
}

function observationId(
  verificationId: string,
  phase: "before" | "after",
  observation: ViraActionProviderObservation,
): string {
  return `obs.${createHash("sha256")
    .update(`${verificationId}\u0000${phase}\u0000${observation.canonicalDigest}\u0000${observation.observedAtEpochMs}`)
    .digest("hex")}`;
}

async function appendObservation(
  client: PostgresClientLike,
  record: ViraDurableActionVerificationRecord,
  phase: "before" | "after",
  observation: ViraActionProviderObservation,
): Promise<void> {
  const id = observationId(record.verificationId, phase, observation);
  const result = await client.query(
    `INSERT INTO vira.action_verification_observation (
       organization_id, project_id, environment, observation_id, verification_id, attempt_id, phase,
       provider_id, connection_id, resource_type, resource_id, provider_version_kind,
       provider_version_value, canonical_digest, observed_at, observation
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)
     ON CONFLICT (organization_id, project_id, environment, observation_id) DO NOTHING`,
    [
      record.scope.organizationId,
      record.scope.projectId,
      record.scope.environment,
      id,
      record.verificationId,
      record.attemptId,
      phase,
      observation.providerId,
      observation.connectionId,
      observation.resourceType,
      observation.resourceId,
      observation.providerVersion.kind,
      observation.providerVersion.value,
      observation.canonicalDigest,
      new Date(observation.observedAtEpochMs),
      JSON.stringify(observation),
    ],
  );
  if (result.rowCount !== 1) {
    const existing = await client.query<Record<string, unknown>>(
      `SELECT canonical_digest, observation
       FROM vira.action_verification_observation
       WHERE organization_id=$1 AND project_id=$2 AND environment=$3 AND observation_id=$4`,
      [record.scope.organizationId, record.scope.projectId, record.scope.environment, id],
    );
    if (
      existing.rows.length !== 1
      || existing.rows[0]!.canonical_digest !== observation.canonicalDigest
      || JSON.stringify(existing.rows[0]!.observation) !== JSON.stringify(observation)
    ) throw new TypeError("PostgreSQL action verification observation id conflicted with different evidence");
  }
}

async function mutate(
  pool: PostgresPoolLike,
  scopeInput: ViraEnterpriseScope,
  verificationId: string,
  expectedRevision: number,
  transition: (
    record: ViraDurableActionVerificationRecord,
    nowEpochMs: number,
  ) => { readonly ok: true; readonly value: ViraDurableActionVerificationRecord } | { readonly ok: false },
  observation?: Readonly<{ phase: "before" | "after"; value: ViraActionProviderObservation }>,
): Promise<ViraPostgresActionVerificationMutationResult> {
  try {
    return await withTenantTransaction(pool, scopeInput, async (client, scope) => {
      const record = await lockedRecord(client, scope, verificationId);
      if (record.revision !== expectedRevision) throw new MutationConflict("VERSION_CONFLICT");
      const nowEpochMs = await dbNowEpochMs(client);
      const next = transition(record, nowEpochMs);
      if (!next.ok) throw new MutationConflict("INVALID_STATE");
      await persistCas(client, scope, next.value, expectedRevision);
      if (observation !== undefined) await appendObservation(client, next.value, observation.phase, observation.value);
      return { ok: true as const, value: next.value };
    });
  } catch (error) {
    if (error instanceof MutationConflict) return { ok: false, code: error.code };
    throw error;
  }
}

export function createPostgresActionVerificationStore(pool: PostgresPoolLike): ViraPostgresActionVerificationStore {
  return Object.freeze({
    async read(
      scopeInput: ViraEnterpriseScope,
      verificationId: string,
    ): Promise<ViraDurableActionVerificationRecord | undefined> {
      const scope = canonicalizeEnterpriseScope(scopeInput);
      if (!safeToken(verificationId)) throw new TypeError("PostgreSQL action verification id is invalid");
      return withTenantTransaction(pool, scope, async (client) => {
        const result = await client.query<VerificationRow>(
          `SELECT organization_id, project_id, environment, verification_id, transaction_id, plan_digest,
            plan_revision, operation_id, execution_id, attempt_id, provider_id, connection_id, resource_type,
            resource_id, revision, status, lease_epoch, record
           FROM vira.action_verification_state
           WHERE organization_id=$1 AND project_id=$2 AND environment=$3 AND verification_id=$4`,
          [scope.organizationId, scope.projectId, scope.environment, verificationId],
        );
        if (result.rows.length === 0) return undefined;
        if (result.rows.length !== 1) throw new TypeError("PostgreSQL action verification identity is not unique");
        return validateRow(result.rows[0]!, scope, verificationId);
      });
    },

    async create(
      record: ViraDurableActionVerificationRecord,
    ): Promise<ViraPostgresActionVerificationMutationResult> {
      if (!isViraDurableActionVerificationRecord(record) || record.revision !== 1 || record.status !== "pending-precheck") {
        return { ok: false, code: "INVALID_STATE" };
      }
      try {
        return await withTenantTransaction(pool, record.scope, async (client, scope) => {
          if (!exactScope(record.scope, scope)) throw new TypeError("PostgreSQL action verification create scope drifted");
          const result = await client.query(
            `INSERT INTO vira.action_verification_state (
               organization_id, project_id, environment, verification_id, transaction_id, plan_digest,
               plan_revision, operation_id, execution_id, attempt_id, provider_id, connection_id,
               resource_type, resource_id, revision, status, lease_epoch, lease_worker_id, lease_expires_at,
               before_observation_digest, after_observation_digest, write_dispatched_at, record
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::jsonb)
             ON CONFLICT (organization_id, project_id, environment, verification_id) DO NOTHING`,
            [
              scope.organizationId, scope.projectId, scope.environment, record.verificationId,
              record.transactionId, record.planDigest, record.planRevision, record.operationId,
              record.executionId, record.attemptId, record.providerId, record.connectionId,
              record.resourceType, record.resourceId, record.revision, record.status, record.leaseEpoch,
              null, null, record.beforeObservationDigest, record.afterObservationDigest, null,
              JSON.stringify(record),
            ],
          );
          if (result.rowCount !== 1) return { ok: false as const, code: "ALREADY_EXISTS" as const };
          return { ok: true as const, value: record };
        });
      } catch (error) {
        if (error instanceof MutationConflict) return { ok: false, code: error.code };
        throw error;
      }
    },

    recordPrecheck(
      input: Parameters<ViraPostgresActionVerificationStore["recordPrecheck"]>[0],
    ): ReturnType<ViraPostgresActionVerificationStore["recordPrecheck"]> {
      return mutate(
        pool,
        input.scope,
        input.verificationId,
        input.expectedRevision,
        (record, nowEpochMs) => recordViraVerificationPrecheck({
          record,
          ...(input.observation === undefined ? {} : { observation: input.observation }),
          precondition: input.precondition,
          nowEpochMs,
        }),
        input.observation === undefined ? undefined : { phase: "before", value: input.observation },
      );
    },

    claimWrite(
      input: Parameters<ViraPostgresActionVerificationStore["claimWrite"]>[0],
    ): ReturnType<ViraPostgresActionVerificationStore["claimWrite"]> {
      return mutate(pool, input.scope, input.verificationId, input.expectedRevision, (record, nowEpochMs) => (
        claimViraVerificationWrite({
          record,
          workerId: input.workerId,
          expectedRevision: input.expectedRevision,
          nowEpochMs,
          leaseMs: input.leaseMs,
        })
      ));
    },

    markWriteDispatched(
      input: Parameters<ViraPostgresActionVerificationStore["markWriteDispatched"]>[0],
    ): ReturnType<ViraPostgresActionVerificationStore["markWriteDispatched"]> {
      return mutate(pool, input.scope, input.verificationId, input.expectedRevision, (record, nowEpochMs) => (
        markViraVerificationWriteDispatched({
          record,
          workerId: input.workerId,
          leaseEpoch: input.leaseEpoch,
          expectedRevision: input.expectedRevision,
          nowEpochMs,
        })
      ));
    },

    beginPostcondition(
      input: Parameters<ViraPostgresActionVerificationStore["beginPostcondition"]>[0],
    ): ReturnType<ViraPostgresActionVerificationStore["beginPostcondition"]> {
      return mutate(pool, input.scope, input.verificationId, input.expectedRevision, (record, nowEpochMs) => (
        beginViraPostconditionVerification({
          record,
          workerId: input.workerId,
          leaseEpoch: input.leaseEpoch,
          expectedRevision: input.expectedRevision,
          nowEpochMs,
        })
      ));
    },

    claimReadback(
      input: Parameters<ViraPostgresActionVerificationStore["claimReadback"]>[0],
    ): ReturnType<ViraPostgresActionVerificationStore["claimReadback"]> {
      return mutate(pool, input.scope, input.verificationId, input.expectedRevision, (record, nowEpochMs) => (
        claimViraVerificationReadback({
          record,
          workerId: input.workerId,
          expectedRevision: input.expectedRevision,
          nowEpochMs,
          leaseMs: input.leaseMs,
        })
      ));
    },

    completePostcondition(
      input: Parameters<ViraPostgresActionVerificationStore["completePostcondition"]>[0],
    ): ReturnType<ViraPostgresActionVerificationStore["completePostcondition"]> {
      return mutate(
        pool,
        input.scope,
        input.verificationId,
        input.expectedRevision,
        (record, nowEpochMs) => completeViraPostconditionVerification({
          record,
          workerId: input.workerId,
          leaseEpoch: input.leaseEpoch,
          expectedRevision: input.expectedRevision,
          nowEpochMs,
          ...(input.observation === undefined ? {} : { observation: input.observation }),
          status: input.status,
        }),
        input.observation === undefined ? undefined : { phase: "after", value: input.observation },
      );
    },

    recoverExpired(
      input: Parameters<ViraPostgresActionVerificationStore["recoverExpired"]>[0],
    ): ReturnType<ViraPostgresActionVerificationStore["recoverExpired"]> {
      return mutate(pool, input.scope, input.verificationId, input.expectedRevision, (record, nowEpochMs) => (
        recoverViraVerificationAfterLeaseExpiry({
          record,
          expectedRevision: input.expectedRevision,
          nowEpochMs,
        })
      ));
    },
  });
}