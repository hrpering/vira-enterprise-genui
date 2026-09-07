import { createHash } from "node:crypto";
import {
  renewViraDurableExecutionLease,
  type ViraDurableExecutionRecord,
} from "../../../packages/durable-execution/src/index.js";
import { createViraDurableExecutionOutboxEvent } from "../../../packages/durable-execution/src/outbox.js";
import type { ViraEnterpriseScope } from "../../../packages/enterprise-context/src/index.js";
import { parseJsonValue, type JsonObject, type JsonValue } from "../../../packages/protocol/src/index.js";
import type { ViraPostgresDurableExecutionMutationResult } from "./durable-execution.js";
import {
  canonicalizeEnterpriseScope,
  withTenantTransaction,
  type PostgresClientLike,
  type PostgresPoolLike,
} from "./transaction.js";

interface LeaseRow extends Record<string, unknown> {
  readonly revision: unknown;
  readonly lease_epoch: unknown;
  readonly lease_worker_id: unknown;
  readonly lease_live?: unknown;
  readonly record: unknown;
}

interface TokenRow extends Record<string, unknown> {
  readonly token: unknown;
}

export interface ViraPostgresDurableExecutionLeaseStore {
  readonly renew: (input: {
    readonly scope: ViraEnterpriseScope;
    readonly executionId: string;
    readonly workerId: string;
    readonly leaseEpoch: number;
    readonly expectedRevision: number;
    readonly nowEpochMs: number;
    readonly leaseMs: number;
  }) => Promise<ViraPostgresDurableExecutionMutationResult>;
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
const MAX_LEASE_MS = 5 * 60 * 1_000;

function safeToken(value: unknown): value is string {
  return typeof value === "string" && SAFE_TOKEN.test(value) && value.trim() === value;
}

function safePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function safeNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactFields(value: JsonObject, expected: ReadonlySet<string>): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.size && keys.every((key) => expected.has(key));
}

function exactScope(left: ViraEnterpriseScope, right: ViraEnterpriseScope): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function rowInteger(value: unknown, allowZero = false): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && (allowZero ? value >= 0 : value >= 1)) return value;
  if (typeof value === "string" && /^(?:0|[1-9][0-9]*)$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && (allowZero ? parsed >= 0 : parsed >= 1)) return parsed;
  }
  throw new TypeError("PostgreSQL durable lease integer is invalid");
}

function parseRecord(input: unknown): ViraDurableExecutionRecord {
  const parsed = parseJsonValue(input, "$.record");
  if (!parsed.ok || !isObject(parsed.value) || !exactFields(parsed.value, RECORD_FIELDS)) {
    throw new TypeError("PostgreSQL durable lease record must be canonical exact-shape JSON");
  }
  const value = parsed.value;
  if (
    value.version !== "1"
    || !safeToken(value.executionId)
    || !isObject(value.scope)
    || !exactFields(value.scope, SCOPE_FIELDS)
    || !safeToken(value.scope.organizationId)
    || !safeToken(value.scope.projectId)
    || (value.scope.environment !== "dev" && value.scope.environment !== "staging" && value.scope.environment !== "production")
    || !safeToken(value.transactionId)
    || typeof value.planDigest !== "string"
    || !SHA256_HEX.test(value.planDigest)
    || !safePositive(value.planRevision)
    || !safeToken(value.operationId)
    || !safeToken(value.grantId)
    || !safeToken(value.grantNonce)
    || !safeToken(value.idempotencyKey)
    || !safePositive(value.revision)
    || !safeNonNegative(value.leaseEpoch)
    || !safePositive(value.createdAtEpochMs)
    || !safePositive(value.updatedAtEpochMs)
  ) throw new TypeError("PostgreSQL durable lease record identity is invalid");
  const scope = canonicalizeEnterpriseScope(value.scope);
  return structuredClone({ ...value, scope }) as unknown as ViraDurableExecutionRecord;
}

function validateRow(
  row: LeaseRow,
  expectedScope: ViraEnterpriseScope,
  expectedExecutionId: string,
): ViraDurableExecutionRecord {
  const record = parseRecord(row.record);
  const revision = rowInteger(row.revision);
  const leaseEpoch = rowInteger(row.lease_epoch, true);
  if (
    !exactScope(record.scope, expectedScope)
    || record.executionId !== expectedExecutionId
    || revision !== record.revision
    || leaseEpoch !== record.leaseEpoch
    || (record.lease === null ? row.lease_worker_id !== null : row.lease_worker_id !== record.lease.workerId)
  ) throw new TypeError("PostgreSQL durable lease row conflicts with canonical record");
  return record;
}

function stableEventId(record: ViraDurableExecutionRecord): string {
  const digest = createHash("sha256")
    .update([record.executionId, String(record.revision), "execution.state-changed"].join("\u0000"))
    .digest("hex");
  return `execution-event:${digest}`;
}

async function insertOutbox(client: PostgresClientLike, record: ViraDurableExecutionRecord): Promise<void> {
  const event = createViraDurableExecutionOutboxEvent({
    eventId: stableEventId(record),
    record,
    type: "execution.state-changed",
    occurredAtEpochMs: record.updatedAtEpochMs,
    payload: {
      status: record.status,
      reason: "lease-renewed",
      workerId: record.lease?.workerId ?? "",
      leaseEpoch: record.leaseEpoch,
      revision: record.revision,
    },
  });
  if (!event.ok) throw new TypeError("PostgreSQL durable lease renewal could not create outbox event");
  const inserted = await client.query<TokenRow>(
    `INSERT INTO vira.durable_execution_outbox
       (organization_id, project_id, environment, event_id, execution_id, event_type, event)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT (organization_id, project_id, environment, event_id) DO NOTHING
     RETURNING event_id AS token`,
    [
      record.scope.organizationId,
      record.scope.projectId,
      record.scope.environment,
      event.value.eventId,
      record.executionId,
      event.value.type,
      JSON.stringify(event.value),
    ],
  );
  if (inserted.rows.length !== 1) throw new TypeError("PostgreSQL durable lease renewal outbox identity unexpectedly collided");
}

export function createPostgresDurableExecutionLeaseStore(
  pool: PostgresPoolLike,
): ViraPostgresDurableExecutionLeaseStore {
  if (pool === null || typeof pool !== "object" || typeof pool.connect !== "function") {
    throw new TypeError("PostgreSQL durable execution lease store requires a pool");
  }

  return Object.freeze({
    async renew(input: Parameters<ViraPostgresDurableExecutionLeaseStore["renew"]>[0]) {
      const scope = canonicalizeEnterpriseScope(input.scope);
      if (
        !safeToken(input.executionId)
        || !safeToken(input.workerId)
        || !safePositive(input.leaseEpoch)
        || !safePositive(input.expectedRevision)
        || !safePositive(input.nowEpochMs)
        || !safePositive(input.leaseMs)
        || input.leaseMs > MAX_LEASE_MS
      ) throw new TypeError("PostgreSQL durable execution lease renewal input is invalid");

      return withTenantTransaction(pool, scope, async (client, transactionScope): Promise<ViraPostgresDurableExecutionMutationResult> => {
        const selected = await client.query<LeaseRow>(
          `SELECT revision, lease_epoch, lease_worker_id, record,
                  (lease_expires_at > clock_timestamp()) AS lease_live
             FROM vira.durable_execution_state
            WHERE organization_id = $1 AND project_id = $2 AND environment = $3 AND execution_id = $4
            FOR UPDATE`,
          [transactionScope.organizationId, transactionScope.projectId, transactionScope.environment, input.executionId],
        );
        if (selected.rows.length === 0) return { ok: false, code: "NOT_FOUND" };
        if (selected.rows.length !== 1) throw new TypeError("PostgreSQL durable lease renewal read returned duplicate state");
        const row = selected.rows[0]!;
        const current = validateRow(row, transactionScope, input.executionId);
        if (current.revision !== input.expectedRevision) return { ok: false, code: "VERSION_CONFLICT" };
        if (row.lease_live !== true) return { ok: false, code: "INVALID_STATE" };

        const next = renewViraDurableExecutionLease({
          record: current,
          workerId: input.workerId,
          leaseEpoch: input.leaseEpoch,
          expectedRevision: input.expectedRevision,
          nowEpochMs: input.nowEpochMs,
          leaseMs: input.leaseMs,
        });
        if (!next.ok) {
          return {
            ok: false,
            code: next.issue.code === "STALE_REVISION" ? "VERSION_CONFLICT" : "INVALID_STATE",
          };
        }

        const updated = await client.query<LeaseRow>(
          `UPDATE vira.durable_execution_state
              SET revision = $5,
                  lease_expires_at = to_timestamp($6::double precision / 1000.0),
                  record = $7::jsonb,
                  persistence_updated_at = clock_timestamp()
            WHERE organization_id = $1 AND project_id = $2 AND environment = $3
              AND execution_id = $4 AND revision = $8
              AND lease_worker_id = $9 AND lease_epoch = $10
              AND lease_expires_at > clock_timestamp()
            RETURNING revision, lease_epoch, lease_worker_id, record`,
          [
            transactionScope.organizationId,
            transactionScope.projectId,
            transactionScope.environment,
            input.executionId,
            next.value.revision,
            next.value.lease?.expiresAtEpochMs ?? null,
            JSON.stringify(next.value),
            current.revision,
            input.workerId,
            input.leaseEpoch,
          ],
        );
        if (updated.rows.length === 0) return { ok: false, code: "VERSION_CONFLICT" };
        if (updated.rows.length !== 1) throw new TypeError("PostgreSQL durable lease renewal update returned duplicate state");
        const persisted = validateRow(updated.rows[0]!, transactionScope, input.executionId);
        await insertOutbox(client, persisted);
        return { ok: true, value: persisted };
      });
    },
  });
}
