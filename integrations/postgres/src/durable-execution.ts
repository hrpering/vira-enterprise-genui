import { createHash } from "node:crypto";
import {
  VIRA_DURABLE_EXECUTION_DISPATCH_STATES,
  VIRA_DURABLE_EXECUTION_STATUSES,
  VIRA_DURABLE_EXECUTION_VERSION,
  claimViraDurableExecution,
  type ViraDurableExecutionRecord,
  type ViraDurableExecutionStageBConsumeResult,
  type ViraDurableExecutionStageBRejectCode,
  type ViraDurableExecutionStageBStore,
} from "../../../packages/durable-execution/src/index.js";
import {
  createViraDurableExecutionOutboxEvent,
  type ViraDurableExecutionOutboxEvent,
  type ViraDurableExecutionOutboxType,
} from "../../../packages/durable-execution/src/outbox.js";
import {
  markViraDurableExecutionDispatchStarted,
  recoverViraDurableExecutionAfterLeaseExpiry,
} from "../../../packages/durable-execution/src/restart.js";
import type { ViraEnterpriseScope } from "../../../packages/enterprise-context/src/index.js";
import { parseJsonValue, type JsonObject, type JsonValue } from "../../../packages/protocol/src/index.js";
import {
  canonicalizeEnterpriseScope,
  withTenantTransaction,
  type PostgresClientLike,
  type PostgresPoolLike,
} from "./transaction.js";

interface DurableExecutionRow extends Record<string, unknown> {
  readonly organization_id: unknown;
  readonly project_id: unknown;
  readonly environment: unknown;
  readonly execution_id: unknown;
  readonly transaction_id: unknown;
  readonly plan_digest: unknown;
  readonly plan_revision: unknown;
  readonly operation_id: unknown;
  readonly grant_id: unknown;
  readonly grant_nonce: unknown;
  readonly idempotency_key: unknown;
  readonly revision: unknown;
  readonly status: unknown;
  readonly lease_epoch: unknown;
  readonly lease_worker_id: unknown;
  readonly lease_live?: unknown;
  readonly dispatch_state: unknown;
  readonly record: unknown;
}

interface RevisionRow extends Record<string, unknown> {
  readonly revision: unknown;
}

interface TokenRow extends Record<string, unknown> {
  readonly token: unknown;
}

interface OutboxRow extends Record<string, unknown> {
  readonly event: unknown;
}

export type ViraPostgresDurableExecutionMutationCode =
  | "ALREADY_EXISTS"
  | "NOT_FOUND"
  | "VERSION_CONFLICT"
  | "INVALID_STATE";

export type ViraPostgresDurableExecutionMutationResult =
  | { readonly ok: true; readonly value: ViraDurableExecutionRecord }
  | { readonly ok: false; readonly code: ViraPostgresDurableExecutionMutationCode };

export interface ViraPostgresDurableExecutionStore extends ViraDurableExecutionStageBStore {
  readonly read: (
    scope: ViraEnterpriseScope,
    executionId: string,
  ) => Promise<ViraDurableExecutionRecord | undefined>;
  readonly create: (
    record: ViraDurableExecutionRecord,
  ) => Promise<ViraPostgresDurableExecutionMutationResult>;
  readonly claimNext: (input: {
    readonly scope: ViraEnterpriseScope;
    readonly workerId: string;
    readonly nowEpochMs: number;
    readonly leaseMs: number;
  }) => Promise<ViraDurableExecutionRecord | undefined>;
  readonly markDispatchStarted: (input: {
    readonly scope: ViraEnterpriseScope;
    readonly executionId: string;
    readonly workerId: string;
    readonly leaseEpoch: number;
    readonly expectedRevision: number;
    readonly nowEpochMs: number;
  }) => Promise<ViraPostgresDurableExecutionMutationResult>;
  readonly recoverExpired: (input: {
    readonly scope: ViraEnterpriseScope;
    readonly executionId: string;
    readonly expectedRevision: number;
    readonly nowEpochMs: number;
  }) => Promise<ViraPostgresDurableExecutionMutationResult>;
  readonly listOutbox: (
    scope: ViraEnterpriseScope,
    limit: number,
  ) => Promise<readonly ViraDurableExecutionOutboxEvent[]>;
  readonly acceptOutboxConsumer: (input: {
    readonly scope: ViraEnterpriseScope;
    readonly eventId: string;
    readonly consumerId: string;
  }) => Promise<"accepted" | "duplicate">;
}

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;
const RECORD_FIELDS = new Set([
  "version",
  "executionId",
  "scope",
  "transactionId",
  "planDigest",
  "planRevision",
  "operationId",
  "grantId",
  "grantNonce",
  "idempotencyKey",
  "revision",
  "status",
  "leaseEpoch",
  "lease",
  "dispatchState",
  "createdAtEpochMs",
  "updatedAtEpochMs",
]);
const SCOPE_FIELDS = new Set(["version", "organizationId", "projectId", "environment"]);
const LEASE_FIELDS = new Set(["workerId", "epoch", "expiresAtEpochMs"]);
const OUTBOX_FIELDS = new Set([
  "version",
  "eventId",
  "scope",
  "executionId",
  "executionRevision",
  "transactionId",
  "planDigest",
  "planRevision",
  "operationId",
  "type",
  "occurredAtEpochMs",
  "payload",
]);

const STATE_COLUMNS = `organization_id, project_id, environment, execution_id, transaction_id, plan_digest,
  plan_revision, operation_id, grant_id, grant_nonce, idempotency_key, revision, status, lease_epoch,
  lease_worker_id, dispatch_state, record`;

class AuthorityConflict extends Error {
  readonly code: ViraDurableExecutionStageBRejectCode;

  constructor(code: ViraDurableExecutionStageBRejectCode) {
    super(code);
    this.name = "AuthorityConflict";
    this.code = code;
  }
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
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

function exactFields(value: JsonObject, expected: ReadonlySet<string>): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.size && keys.every((key) => expected.has(key));
}

function freezeJson<T extends JsonValue>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const entry of value) freezeJson(entry);
    return Object.freeze(value) as T;
  }
  for (const entry of Object.values(value)) freezeJson(entry);
  return Object.freeze(value) as T;
}

function rowInteger(value: unknown, allowZero = false): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && (allowZero ? value >= 0 : value >= 1)) return value;
  if (typeof value === "string" && /^(?:0|[1-9][0-9]*)$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && (allowZero ? parsed >= 0 : parsed >= 1)) return parsed;
  }
  throw new TypeError("PostgreSQL durable execution integer is invalid");
}

function parseScope(input: JsonValue | undefined): ViraEnterpriseScope {
  if (!isObject(input) || !exactFields(input, SCOPE_FIELDS)) {
    throw new TypeError("PostgreSQL durable execution scope is invalid");
  }
  return canonicalizeEnterpriseScope(input);
}

function parseDurableExecutionRecord(input: unknown): ViraDurableExecutionRecord {
  const parsed = parseJsonValue(input, "$.record");
  if (!parsed.ok || !isObject(parsed.value) || !exactFields(parsed.value, RECORD_FIELDS)) {
    throw new TypeError("PostgreSQL durable execution record must be canonical exact-shape JSON");
  }
  const record = parsed.value;
  const scope = parseScope(record.scope);
  if (
    record.version !== VIRA_DURABLE_EXECUTION_VERSION
    || !safeToken(record.executionId)
    || !safeToken(record.transactionId)
    || typeof record.planDigest !== "string"
    || !SHA256_HEX.test(record.planDigest)
    || !safePositive(record.planRevision)
    || !safeToken(record.operationId)
    || !safeToken(record.grantId)
    || !safeToken(record.grantNonce)
    || !safeToken(record.idempotencyKey)
    || !safePositive(record.revision)
    || typeof record.status !== "string"
    || !VIRA_DURABLE_EXECUTION_STATUSES.includes(record.status as (typeof VIRA_DURABLE_EXECUTION_STATUSES)[number])
    || !safeNonNegative(record.leaseEpoch)
    || typeof record.dispatchState !== "string"
    || !VIRA_DURABLE_EXECUTION_DISPATCH_STATES.includes(record.dispatchState as (typeof VIRA_DURABLE_EXECUTION_DISPATCH_STATES)[number])
    || !safePositive(record.createdAtEpochMs)
    || !safePositive(record.updatedAtEpochMs)
    || record.updatedAtEpochMs < record.createdAtEpochMs
  ) throw new TypeError("PostgreSQL durable execution record identity/state is invalid");

  if (record.lease !== null) {
    if (
      !isObject(record.lease)
      || !exactFields(record.lease, LEASE_FIELDS)
      || !safeToken(record.lease.workerId)
      || !safePositive(record.lease.epoch)
      || record.lease.epoch !== record.leaseEpoch
      || !safePositive(record.lease.expiresAtEpochMs)
    ) throw new TypeError("PostgreSQL durable execution lease is invalid");
  }

  const frozenRecord = freezeJson(record);
  return Object.freeze({
    ...frozenRecord,
    scope: Object.freeze({
      version: scope.version,
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      environment: scope.environment,
    }),
  }) as unknown as ViraDurableExecutionRecord;
}

function exactScope(left: ViraEnterpriseScope, right: ViraEnterpriseScope): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function validateStateRow(
  row: DurableExecutionRow,
  expectedScope: ViraEnterpriseScope,
  expectedExecutionId?: string,
): ViraDurableExecutionRecord {
  const record = parseDurableExecutionRecord(row.record);
  const rowScope = canonicalizeEnterpriseScope({
    version: "1",
    organizationId: row.organization_id,
    projectId: row.project_id,
    environment: row.environment,
  });
  const revision = rowInteger(row.revision);
  const planRevision = rowInteger(row.plan_revision);
  const leaseEpoch = rowInteger(row.lease_epoch, true);
  if (
    !exactScope(rowScope, expectedScope)
    || !exactScope(record.scope, expectedScope)
    || row.execution_id !== record.executionId
    || (expectedExecutionId !== undefined && record.executionId !== expectedExecutionId)
    || row.transaction_id !== record.transactionId
    || row.plan_digest !== record.planDigest
    || planRevision !== record.planRevision
    || row.operation_id !== record.operationId
    || row.grant_id !== record.grantId
    || row.grant_nonce !== record.grantNonce
    || row.idempotency_key !== record.idempotencyKey
    || revision !== record.revision
    || row.status !== record.status
    || leaseEpoch !== record.leaseEpoch
    || row.dispatch_state !== record.dispatchState
    || (record.lease === null ? row.lease_worker_id !== null : row.lease_worker_id !== record.lease.workerId)
  ) throw new TypeError("PostgreSQL durable execution row conflicts with canonical record");
  return record;
}

function validatePool(pool: PostgresPoolLike): void {
  if (pool === null || typeof pool !== "object" || typeof pool.connect !== "function") {
    throw new TypeError("PostgreSQL durable execution store requires a pool");
  }
}

function stableId(prefix: string, parts: readonly string[]): string {
  const digest = createHash("sha256").update(parts.join("\u0000")).digest("hex");
  return `${prefix}:${digest}`;
}

function stateEvent(
  record: ViraDurableExecutionRecord,
  type: ViraDurableExecutionOutboxType,
  payload: JsonObject,
): ViraDurableExecutionOutboxEvent {
  const event = createViraDurableExecutionOutboxEvent({
    eventId: stableId("execution-event", [record.executionId, String(record.revision), type]),
    record,
    type,
    occurredAtEpochMs: record.updatedAtEpochMs,
    payload,
  });
  if (!event.ok) throw new TypeError("durable execution outbox event could not be created");
  return event.value;
}

async function insertOutbox(client: PostgresClientLike, event: ViraDurableExecutionOutboxEvent): Promise<void> {
  const result = await client.query<TokenRow>(
    `INSERT INTO vira.durable_execution_outbox
       (organization_id, project_id, environment, event_id, execution_id, event_type, event)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT (organization_id, project_id, environment, event_id) DO NOTHING
     RETURNING event_id AS token`,
    [
      event.scope.organizationId,
      event.scope.projectId,
      event.scope.environment,
      event.eventId,
      event.executionId,
      event.type,
      JSON.stringify(event),
    ],
  );
  if (result.rows.length !== 1) {
    throw new TypeError("durable execution outbox event identity unexpectedly collided");
  }
}

async function updateState(
  client: PostgresClientLike,
  scope: ViraEnterpriseScope,
  record: ViraDurableExecutionRecord,
  expectedRevision: number,
): Promise<ViraDurableExecutionRecord | undefined> {
  const result = await client.query<DurableExecutionRow>(
    `UPDATE vira.durable_execution_state
        SET revision = $5,
            status = $6,
            lease_epoch = $7,
            lease_worker_id = $8,
            lease_expires_at = CASE WHEN $9::bigint IS NULL THEN NULL ELSE to_timestamp($9::double precision / 1000.0) END,
            dispatch_state = $10,
            record = $11::jsonb,
            persistence_updated_at = clock_timestamp()
      WHERE organization_id = $1 AND project_id = $2 AND environment = $3
        AND execution_id = $4 AND revision = $12
      RETURNING ${STATE_COLUMNS}`,
    [
      scope.organizationId,
      scope.projectId,
      scope.environment,
      record.executionId,
      record.revision,
      record.status,
      record.leaseEpoch,
      record.lease?.workerId ?? null,
      record.lease?.expiresAtEpochMs ?? null,
      record.dispatchState,
      JSON.stringify(record),
      expectedRevision,
    ],
  );
  if (result.rows.length === 0) return undefined;
  if (result.rows.length !== 1) throw new TypeError("PostgreSQL durable execution update returned duplicate state");
  return validateStateRow(result.rows[0]!, scope, record.executionId);
}

function parseOutboxEvent(input: unknown): ViraDurableExecutionOutboxEvent {
  const parsed = parseJsonValue(input, "$.event");
  if (!parsed.ok || !isObject(parsed.value) || !exactFields(parsed.value, OUTBOX_FIELDS)) {
    throw new TypeError("PostgreSQL durable execution outbox row is invalid");
  }
  const event = parsed.value;
  const scope = parseScope(event.scope);
  if (
    event.version !== "1"
    || !safeToken(event.eventId)
    || !safeToken(event.executionId)
    || !safePositive(event.executionRevision)
    || !safeToken(event.transactionId)
    || typeof event.planDigest !== "string"
    || !SHA256_HEX.test(event.planDigest)
    || !safePositive(event.planRevision)
    || !safeToken(event.operationId)
    || typeof event.type !== "string"
    || !safePositive(event.occurredAtEpochMs)
    || !isObject(event.payload)
  ) throw new TypeError("PostgreSQL durable execution outbox event identity is invalid");
  const frozenEvent = freezeJson(event);
  return Object.freeze({
    ...frozenEvent,
    scope: Object.freeze({
      version: scope.version,
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      environment: scope.environment,
    }),
  }) as unknown as ViraDurableExecutionOutboxEvent;
}

export function createPostgresDurableExecutionStore(pool: PostgresPoolLike): ViraPostgresDurableExecutionStore {
  validatePool(pool);

  const store: ViraPostgresDurableExecutionStore = {
    async read(scopeInput, executionId) {
      const scope = canonicalizeEnterpriseScope(scopeInput);
      if (!safeToken(executionId)) throw new TypeError("PostgreSQL durable execution id is invalid");
      return withTenantTransaction(pool, scope, async (client, transactionScope) => {
        const result = await client.query<DurableExecutionRow>(
          `SELECT ${STATE_COLUMNS}
             FROM vira.durable_execution_state
            WHERE organization_id = $1 AND project_id = $2 AND environment = $3 AND execution_id = $4`,
          [transactionScope.organizationId, transactionScope.projectId, transactionScope.environment, executionId],
        );
        if (result.rows.length === 0) return undefined;
        if (result.rows.length !== 1) throw new TypeError("PostgreSQL durable execution read returned duplicate state");
        return validateStateRow(result.rows[0]!, transactionScope, executionId);
      });
    },

    async create(input) {
      const record = parseDurableExecutionRecord(input);
      return withTenantTransaction(pool, record.scope, async (client, scope): Promise<ViraPostgresDurableExecutionMutationResult> => {
        const result = await client.query<DurableExecutionRow>(
          `INSERT INTO vira.durable_execution_state
             (organization_id, project_id, environment, execution_id, transaction_id, plan_digest, plan_revision,
              operation_id, grant_id, grant_nonce, idempotency_key, revision, status, lease_epoch,
              lease_worker_id, lease_expires_at, dispatch_state, record)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NULL, NULL, $15, $16::jsonb)
           ON CONFLICT (organization_id, project_id, environment, execution_id) DO NOTHING
           RETURNING ${STATE_COLUMNS}`,
          [
            scope.organizationId,
            scope.projectId,
            scope.environment,
            record.executionId,
            record.transactionId,
            record.planDigest,
            record.planRevision,
            record.operationId,
            record.grantId,
            record.grantNonce,
            record.idempotencyKey,
            record.revision,
            record.status,
            record.leaseEpoch,
            record.dispatchState,
            JSON.stringify(record),
          ],
        );
        if (result.rows.length === 0) return { ok: false, code: "ALREADY_EXISTS" };
        if (result.rows.length !== 1) throw new TypeError("PostgreSQL durable execution create returned duplicate state");
        const persisted = validateStateRow(result.rows[0]!, scope, record.executionId);
        await insertOutbox(client, stateEvent(persisted, "execution.queued", {
          status: persisted.status,
          revision: persisted.revision,
        }));
        return { ok: true, value: persisted };
      });
    },

    async claimNext(input) {
      const scope = canonicalizeEnterpriseScope(input.scope);
      if (!safeToken(input.workerId) || !safePositive(input.nowEpochMs) || !safePositive(input.leaseMs)) {
        throw new TypeError("PostgreSQL durable execution claim input is invalid");
      }
      return withTenantTransaction(pool, scope, async (client, transactionScope) => {
        const result = await client.query<DurableExecutionRow>(
          `SELECT ${STATE_COLUMNS}
             FROM vira.durable_execution_state
            WHERE organization_id = $1 AND project_id = $2 AND environment = $3
              AND status IN ('queued', 'recovery')
              AND (lease_expires_at IS NULL OR lease_expires_at <= to_timestamp($4::double precision / 1000.0))
            ORDER BY persistence_created_at, execution_id
            FOR UPDATE SKIP LOCKED
            LIMIT 1`,
          [transactionScope.organizationId, transactionScope.projectId, transactionScope.environment, input.nowEpochMs],
        );
        if (result.rows.length === 0) return undefined;
        if (result.rows.length !== 1) throw new TypeError("PostgreSQL durable execution claim returned multiple rows");
        const current = validateStateRow(result.rows[0]!, transactionScope);
        const claimed = claimViraDurableExecution({
          record: current,
          workerId: input.workerId,
          nowEpochMs: input.nowEpochMs,
          leaseMs: input.leaseMs,
        });
        if (!claimed.ok) throw new TypeError(`PostgreSQL durable execution selected an unclaimable row: ${claimed.issue.code}`);
        const persisted = await updateState(client, transactionScope, claimed.value, current.revision);
        if (!persisted) throw new TypeError("PostgreSQL durable execution claim lost its locked CAS revision");
        await insertOutbox(client, stateEvent(persisted, "execution.claimed", {
          status: persisted.status,
          workerId: input.workerId,
          leaseEpoch: persisted.leaseEpoch,
          revision: persisted.revision,
        }));
        return persisted;
      });
    },

    async markDispatchStarted(input) {
      const scope = canonicalizeEnterpriseScope(input.scope);
      if (
        !safeToken(input.executionId)
        || !safeToken(input.workerId)
        || !safePositive(input.leaseEpoch)
        || !safePositive(input.expectedRevision)
        || !safePositive(input.nowEpochMs)
      ) throw new TypeError("PostgreSQL durable execution dispatch input is invalid");
      return withTenantTransaction(pool, scope, async (client, transactionScope): Promise<ViraPostgresDurableExecutionMutationResult> => {
        const result = await client.query<DurableExecutionRow>(
          `SELECT ${STATE_COLUMNS}
             FROM vira.durable_execution_state
            WHERE organization_id = $1 AND project_id = $2 AND environment = $3 AND execution_id = $4
            FOR UPDATE`,
          [transactionScope.organizationId, transactionScope.projectId, transactionScope.environment, input.executionId],
        );
        if (result.rows.length === 0) return { ok: false, code: "NOT_FOUND" };
        if (result.rows.length !== 1) throw new TypeError("PostgreSQL durable execution dispatch read returned duplicate state");
        const current = validateStateRow(result.rows[0]!, transactionScope, input.executionId);
        if (current.revision !== input.expectedRevision) return { ok: false, code: "VERSION_CONFLICT" };
        const next = markViraDurableExecutionDispatchStarted({
          record: current,
          workerId: input.workerId,
          leaseEpoch: input.leaseEpoch,
          expectedRevision: input.expectedRevision,
          nowEpochMs: input.nowEpochMs,
        });
        if (!next.ok) return { ok: false, code: next.issue.code === "STALE_REVISION" ? "VERSION_CONFLICT" : "INVALID_STATE" };
        const persisted = await updateState(client, transactionScope, next.value, current.revision);
        if (!persisted) return { ok: false, code: "VERSION_CONFLICT" };
        await insertOutbox(client, stateEvent(persisted, "execution.dispatch-started", {
          workerId: input.workerId,
          leaseEpoch: input.leaseEpoch,
          revision: persisted.revision,
        }));
        return { ok: true, value: persisted };
      });
    },

    async recoverExpired(input) {
      const scope = canonicalizeEnterpriseScope(input.scope);
      if (!safeToken(input.executionId) || !safePositive(input.expectedRevision) || !safePositive(input.nowEpochMs)) {
        throw new TypeError("PostgreSQL durable execution recovery input is invalid");
      }
      return withTenantTransaction(pool, scope, async (client, transactionScope): Promise<ViraPostgresDurableExecutionMutationResult> => {
        const result = await client.query<DurableExecutionRow>(
          `SELECT ${STATE_COLUMNS}
             FROM vira.durable_execution_state
            WHERE organization_id = $1 AND project_id = $2 AND environment = $3 AND execution_id = $4
            FOR UPDATE`,
          [transactionScope.organizationId, transactionScope.projectId, transactionScope.environment, input.executionId],
        );
        if (result.rows.length === 0) return { ok: false, code: "NOT_FOUND" };
        if (result.rows.length !== 1) throw new TypeError("PostgreSQL durable execution recovery read returned duplicate state");
        const current = validateStateRow(result.rows[0]!, transactionScope, input.executionId);
        if (current.revision !== input.expectedRevision) return { ok: false, code: "VERSION_CONFLICT" };
        const next = recoverViraDurableExecutionAfterLeaseExpiry({
          record: current,
          expectedRevision: input.expectedRevision,
          nowEpochMs: input.nowEpochMs,
        });
        if (!next.ok) return { ok: false, code: next.issue.code === "STALE_REVISION" ? "VERSION_CONFLICT" : "INVALID_STATE" };
        const persisted = await updateState(client, transactionScope, next.value, current.revision);
        if (!persisted) return { ok: false, code: "VERSION_CONFLICT" };
        await insertOutbox(client, stateEvent(persisted, "execution.state-changed", {
          status: persisted.status,
          reason: persisted.status === "uncertain" ? "lease-expired-after-dispatch" : "lease-expired-before-dispatch",
          revision: persisted.revision,
        }));
        return { ok: true, value: persisted };
      });
    },

    async consumeGrantAndReserveEffect(input): Promise<ViraDurableExecutionStageBConsumeResult> {
      try {
        return await withTenantTransaction(pool, input.scope, async (client, scope): Promise<ViraDurableExecutionStageBConsumeResult> => {
          const stateResult = await client.query<DurableExecutionRow>(
            `SELECT ${STATE_COLUMNS}, (lease_expires_at > clock_timestamp()) AS lease_live
               FROM vira.durable_execution_state
              WHERE organization_id = $1 AND project_id = $2 AND environment = $3 AND execution_id = $4
              FOR UPDATE`,
            [scope.organizationId, scope.projectId, scope.environment, input.executionId],
          );
          if (stateResult.rows.length === 0) return { ok: false, code: "NOT_FOUND" };
          if (stateResult.rows.length !== 1) throw new TypeError("PostgreSQL durable execution Stage B read returned duplicate state");
          const row = stateResult.rows[0]!;
          const current = validateStateRow(row, scope, input.executionId);
          if (current.revision !== input.expectedRevision) return { ok: false, code: "STALE_REVISION" };
          if (
            current.status !== "executing"
            || current.lease === null
            || current.lease.workerId !== input.workerId
            || current.lease.epoch !== input.leaseEpoch
            || current.leaseEpoch !== input.leaseEpoch
            || row.lease_live !== true
          ) return { ok: false, code: "STALE_LEASE" };
          if (current.dispatchState !== "not-started") {
            return { ok: false, code: "EFFECT_CONFLICT" };
          }
          if (
            current.transactionId !== input.transactionId
            || current.planDigest !== input.planDigest
            || current.planRevision !== input.planRevision
            || current.operationId !== input.operationId
            || current.grantId !== input.grantId
            || current.grantNonce !== input.nonce
            || current.idempotencyKey !== input.idempotencyKey
          ) throw new TypeError("PostgreSQL durable execution Stage B coordinates conflict with canonical state");

          const nonceResult = await client.query<TokenRow>(
            `INSERT INTO vira.durable_execution_nonce
               (organization_id, project_id, environment, nonce, grant_id, execution_id, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7::double precision / 1000.0))
             ON CONFLICT (organization_id, project_id, environment, nonce) DO NOTHING
             RETURNING nonce AS token`,
            [scope.organizationId, scope.projectId, scope.environment, input.nonce, input.grantId, input.executionId, input.nonceExpiresAtEpochMs],
          );
          if (nonceResult.rows.length > 1) throw new TypeError("PostgreSQL durable nonce insert returned duplicate rows");
          if (nonceResult.rows.length === 0) {
            const existingNonce = await client.query<TokenRow>(
              `SELECT nonce AS token
                 FROM vira.durable_execution_nonce
                WHERE organization_id = $1 AND project_id = $2 AND environment = $3
                  AND nonce = $4 AND grant_id = $5 AND execution_id = $6`,
              [scope.organizationId, scope.projectId, scope.environment, input.nonce, input.grantId, input.executionId],
            );
            if (existingNonce.rows.length !== 1) throw new AuthorityConflict("NONCE_REPLAY");
          }

          const reservationId = stableId("effect-reservation", [
            scope.organizationId,
            scope.projectId,
            scope.environment,
            input.executionId,
            input.transactionId,
            input.planDigest,
            String(input.planRevision),
            input.operationId,
            input.idempotencyKey,
          ]);

          const idempotencyResult = await client.query<TokenRow>(
            `INSERT INTO vira.durable_execution_idempotency_reservation
               (organization_id, project_id, environment, idempotency_key, reservation_id, execution_id,
                transaction_id, plan_digest, plan_revision, operation_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (organization_id, project_id, environment, idempotency_key) DO NOTHING
             RETURNING reservation_id AS token`,
            [
              scope.organizationId,
              scope.projectId,
              scope.environment,
              input.idempotencyKey,
              reservationId,
              input.executionId,
              input.transactionId,
              input.planDigest,
              input.planRevision,
              input.operationId,
            ],
          );
          if (idempotencyResult.rows.length > 1) throw new TypeError("PostgreSQL durable idempotency insert returned duplicate rows");
          if (idempotencyResult.rows.length === 0) {
            const existingIdempotency = await client.query<TokenRow>(
              `SELECT reservation_id AS token
                 FROM vira.durable_execution_idempotency_reservation
                WHERE organization_id = $1 AND project_id = $2 AND environment = $3
                  AND idempotency_key = $4 AND reservation_id = $5 AND execution_id = $6
                  AND transaction_id = $7 AND plan_digest = $8 AND plan_revision = $9 AND operation_id = $10`,
              [
                scope.organizationId,
                scope.projectId,
                scope.environment,
                input.idempotencyKey,
                reservationId,
                input.executionId,
                input.transactionId,
                input.planDigest,
                input.planRevision,
                input.operationId,
              ],
            );
            if (existingIdempotency.rows.length !== 1) throw new AuthorityConflict("IDEMPOTENCY_CONFLICT");
          }

          const effectResult = await client.query<TokenRow>(
            `INSERT INTO vira.durable_execution_effect_reservation
               (organization_id, project_id, environment, transaction_id, plan_digest, plan_revision,
                operation_id, reservation_id, execution_id, bound_lease_epoch)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (organization_id, project_id, environment, transaction_id, plan_digest, plan_revision, operation_id) DO NOTHING
             RETURNING reservation_id AS token`,
            [
              scope.organizationId,
              scope.projectId,
              scope.environment,
              input.transactionId,
              input.planDigest,
              input.planRevision,
              input.operationId,
              reservationId,
              input.executionId,
              input.leaseEpoch,
            ],
          );
          if (effectResult.rows.length > 1) throw new TypeError("PostgreSQL durable effect insert returned duplicate rows");
          if (effectResult.rows.length === 0) {
            const rebound = await client.query<TokenRow>(
              `UPDATE vira.durable_execution_effect_reservation
                  SET bound_lease_epoch = $10
                WHERE organization_id = $1 AND project_id = $2 AND environment = $3
                  AND transaction_id = $4 AND plan_digest = $5 AND plan_revision = $6 AND operation_id = $7
                  AND reservation_id = $8 AND execution_id = $9
                  AND bound_lease_epoch < $10
                RETURNING reservation_id AS token`,
              [
                scope.organizationId,
                scope.projectId,
                scope.environment,
                input.transactionId,
                input.planDigest,
                input.planRevision,
                input.operationId,
                reservationId,
                input.executionId,
                input.leaseEpoch,
              ],
            );
            if (rebound.rows.length !== 1) throw new AuthorityConflict("EFFECT_CONFLICT");
          }

          const revisionResult = await client.query<RevisionRow>(
            `UPDATE vira.durable_execution_state
                SET revision = revision + 1,
                    record = jsonb_set(
                      jsonb_set(record, '{revision}', to_jsonb(revision + 1), false),
                      '{updatedAtEpochMs}',
                      to_jsonb((floor(extract(epoch FROM clock_timestamp()) * 1000))::bigint),
                      false
                    ),
                    persistence_updated_at = clock_timestamp()
              WHERE organization_id = $1 AND project_id = $2 AND environment = $3
                AND execution_id = $4 AND revision = $5
                AND lease_worker_id = $6 AND lease_epoch = $7
                AND lease_expires_at > clock_timestamp()
                AND dispatch_state = 'not-started'
              RETURNING revision`,
            [
              scope.organizationId,
              scope.projectId,
              scope.environment,
              input.executionId,
              input.expectedRevision,
              input.workerId,
              input.leaseEpoch,
            ],
          );
          if (revisionResult.rows.length !== 1) throw new AuthorityConflict("STALE_REVISION");
          return {
            ok: true,
            value: {
              revision: rowInteger(revisionResult.rows[0]!.revision),
              reservationId,
            },
          };
        });
      } catch (error) {
        if (error instanceof AuthorityConflict) return { ok: false, code: error.code };
        throw error;
      }
    },

    async listOutbox(scopeInput, limit) {
      const scope = canonicalizeEnterpriseScope(scopeInput);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
        throw new TypeError("PostgreSQL durable execution outbox limit is invalid");
      }
      return withTenantTransaction(pool, scope, async (client, transactionScope) => {
        const result = await client.query<OutboxRow>(
          `SELECT event
             FROM vira.durable_execution_outbox
            WHERE organization_id = $1 AND project_id = $2 AND environment = $3
            ORDER BY created_at, event_id
            LIMIT $4`,
          [transactionScope.organizationId, transactionScope.projectId, transactionScope.environment, limit],
        );
        return Object.freeze(result.rows.map((row) => {
          const event = parseOutboxEvent(row.event);
          if (!exactScope(event.scope, transactionScope)) throw new TypeError("PostgreSQL outbox event crossed tenant scope");
          return event;
        }));
      });
    },

    async acceptOutboxConsumer(input) {
      const scope = canonicalizeEnterpriseScope(input.scope);
      if (!safeToken(input.eventId) || !safeToken(input.consumerId)) {
        throw new TypeError("PostgreSQL durable execution consumer receipt is invalid");
      }
      return withTenantTransaction(pool, scope, async (client, transactionScope) => {
        const result = await client.query<TokenRow>(
          `INSERT INTO vira.durable_execution_outbox_consumer
             (organization_id, project_id, environment, event_id, consumer_id)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (organization_id, project_id, environment, event_id, consumer_id) DO NOTHING
           RETURNING consumer_id AS token`,
          [transactionScope.organizationId, transactionScope.projectId, transactionScope.environment, input.eventId, input.consumerId],
        );
        return result.rows.length === 1 ? "accepted" : "duplicate";
      });
    },
  };

  return Object.freeze(store);
}
