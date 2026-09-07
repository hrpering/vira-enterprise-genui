import { createHash } from "node:crypto";
import type {
  ViraFrozenTransactionPlan,
  ViraSignedTransactionExecutionGrant,
} from "../../../packages/action-transaction/src/index.js";
import {
  createViraDurableExecutionAuthoritySnapshot,
  type ViraDurableExecutionAuthoritySnapshot,
} from "../../../packages/durable-execution/src/authority.js";
import type { ViraDurableExecutionRecord } from "../../../packages/durable-execution/src/index.js";
import { createViraDurableExecutionOutboxEvent } from "../../../packages/durable-execution/src/outbox.js";
import type { ViraEnterpriseScope } from "../../../packages/enterprise-context/src/index.js";
import { parseJsonValue, type JsonObject, type JsonValue } from "../../../packages/protocol/src/index.js";
import {
  canonicalizeEnterpriseScope,
  withTenantTransaction,
  type PostgresPoolLike,
} from "./transaction.js";

export type ViraPostgresDurableExecutionEnqueueResult =
  | { readonly ok: true; readonly value: ViraDurableExecutionRecord }
  | { readonly ok: false; readonly code: "ALREADY_EXISTS" };

export interface ViraPostgresDurableExecutionAuthorityRepository {
  readonly enqueueWithAuthority: (input: {
    readonly record: ViraDurableExecutionRecord;
    readonly frozen: ViraFrozenTransactionPlan;
    readonly grant: ViraSignedTransactionExecutionGrant;
  }) => Promise<ViraPostgresDurableExecutionEnqueueResult>;
  readonly readAuthority: (
    scope: ViraEnterpriseScope,
    executionId: string,
  ) => Promise<ViraDurableExecutionAuthoritySnapshot | undefined>;
}

interface TokenRow extends Record<string, unknown> {
  readonly token: unknown;
}

interface AuthorityRow extends Record<string, unknown> {
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
  readonly authority: unknown;
}

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;
const AUTHORITY_FIELDS = new Set([
  "version",
  "executionId",
  "scope",
  "transactionId",
  "planDigest",
  "planRevision",
  "operationId",
  "grantId",
  "grantNonce",
  "frozen",
  "grant",
]);

function isObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeToken(value: unknown): value is string {
  return typeof value === "string" && SAFE_TOKEN.test(value) && value.trim() === value;
}

function safePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function rowInteger(value: unknown): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 1) return value;
  if (typeof value === "string" && /^[1-9][0-9]*$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  throw new TypeError("PostgreSQL durable authority integer is invalid");
}

function exactScope(left: ViraEnterpriseScope, right: ViraEnterpriseScope): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
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

function parseAuthority(input: unknown): ViraDurableExecutionAuthoritySnapshot {
  const parsed = parseJsonValue(input, "$.authority");
  if (!parsed.ok || !isObject(parsed.value)) throw new TypeError("PostgreSQL durable authority must be canonical JSON");
  const value = parsed.value;
  const keys = Object.keys(value);
  if (keys.length !== AUTHORITY_FIELDS.size || keys.some((key) => !AUTHORITY_FIELDS.has(key))) {
    throw new TypeError("PostgreSQL durable authority has an invalid shape");
  }
  if (
    value.version !== "1"
    || !safeToken(value.executionId)
    || !safeToken(value.transactionId)
    || typeof value.planDigest !== "string"
    || !SHA256_HEX.test(value.planDigest)
    || !safePositive(value.planRevision)
    || !safeToken(value.operationId)
    || !safeToken(value.grantId)
    || !safeToken(value.grantNonce)
    || !isObject(value.scope)
    || !isObject(value.frozen)
    || !isObject(value.grant)
  ) throw new TypeError("PostgreSQL durable authority identity is invalid");
  const scope = canonicalizeEnterpriseScope(value.scope);
  const frozenValue = freezeJson(value);
  return Object.freeze({
    ...frozenValue,
    scope: Object.freeze({
      version: scope.version,
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      environment: scope.environment,
    }),
  }) as unknown as ViraDurableExecutionAuthoritySnapshot;
}

function validateAuthorityRow(
  row: AuthorityRow,
  expectedScope: ViraEnterpriseScope,
  expectedExecutionId: string,
): ViraDurableExecutionAuthoritySnapshot {
  const authority = parseAuthority(row.authority);
  const rowScope = canonicalizeEnterpriseScope({
    version: "1",
    organizationId: row.organization_id,
    projectId: row.project_id,
    environment: row.environment,
  });
  if (
    !exactScope(rowScope, expectedScope)
    || !exactScope(authority.scope, expectedScope)
    || row.execution_id !== expectedExecutionId
    || authority.executionId !== expectedExecutionId
    || row.transaction_id !== authority.transactionId
    || row.plan_digest !== authority.planDigest
    || rowInteger(row.plan_revision) !== authority.planRevision
    || row.operation_id !== authority.operationId
    || row.grant_id !== authority.grantId
    || row.grant_nonce !== authority.grantNonce
  ) throw new TypeError("PostgreSQL durable authority row conflicts with its canonical snapshot");
  return authority;
}

function stableEventId(record: ViraDurableExecutionRecord): string {
  const digest = createHash("sha256")
    .update([record.executionId, String(record.revision), "execution.queued"].join("\u0000"))
    .digest("hex");
  return `execution-event:${digest}`;
}

export function createPostgresDurableExecutionAuthorityRepository(
  pool: PostgresPoolLike,
): ViraPostgresDurableExecutionAuthorityRepository {
  if (pool === null || typeof pool !== "object" || typeof pool.connect !== "function") {
    throw new TypeError("PostgreSQL durable execution authority repository requires a pool");
  }

  return Object.freeze({
    async enqueueWithAuthority(
      input: Parameters<ViraPostgresDurableExecutionAuthorityRepository["enqueueWithAuthority"]>[0],
    ) {
      const snapshot = createViraDurableExecutionAuthoritySnapshot(input);
      if (!snapshot.ok) throw new TypeError(`durable execution authority snapshot rejected: ${snapshot.code}`);
      const record = input.record;
      return withTenantTransaction(pool, record.scope, async (client, scope): Promise<ViraPostgresDurableExecutionEnqueueResult> => {
        const state = await client.query<TokenRow>(
          `INSERT INTO vira.durable_execution_state
             (organization_id, project_id, environment, execution_id, transaction_id, plan_digest, plan_revision,
              operation_id, grant_id, grant_nonce, idempotency_key, revision, status, lease_epoch,
              lease_worker_id, lease_expires_at, dispatch_state, record)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NULL, NULL, $15, $16::jsonb)
           ON CONFLICT (organization_id, project_id, environment, execution_id) DO NOTHING
           RETURNING execution_id AS token`,
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
        if (state.rows.length === 0) return { ok: false, code: "ALREADY_EXISTS" };
        if (state.rows.length !== 1) throw new TypeError("PostgreSQL durable enqueue returned duplicate state");

        const authority = await client.query<TokenRow>(
          `INSERT INTO vira.durable_execution_authority
             (organization_id, project_id, environment, execution_id, transaction_id, plan_digest, plan_revision,
              operation_id, grant_id, grant_nonce, authority)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
           ON CONFLICT (organization_id, project_id, environment, execution_id) DO NOTHING
           RETURNING execution_id AS token`,
          [
            scope.organizationId,
            scope.projectId,
            scope.environment,
            snapshot.value.executionId,
            snapshot.value.transactionId,
            snapshot.value.planDigest,
            snapshot.value.planRevision,
            snapshot.value.operationId,
            snapshot.value.grantId,
            snapshot.value.grantNonce,
            JSON.stringify(snapshot.value),
          ],
        );
        if (authority.rows.length !== 1) {
          throw new TypeError("PostgreSQL durable enqueue authority unexpectedly collided");
        }

        const event = createViraDurableExecutionOutboxEvent({
          eventId: stableEventId(record),
          record,
          type: "execution.queued",
          occurredAtEpochMs: record.updatedAtEpochMs,
          payload: { status: record.status, revision: record.revision },
        });
        if (!event.ok) throw new TypeError("PostgreSQL durable enqueue could not create queued outbox event");
        const outbox = await client.query<TokenRow>(
          `INSERT INTO vira.durable_execution_outbox
             (organization_id, project_id, environment, event_id, execution_id, event_type, event)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
           ON CONFLICT (organization_id, project_id, environment, event_id) DO NOTHING
           RETURNING event_id AS token`,
          [
            scope.organizationId,
            scope.projectId,
            scope.environment,
            event.value.eventId,
            event.value.executionId,
            event.value.type,
            JSON.stringify(event.value),
          ],
        );
        if (outbox.rows.length !== 1) throw new TypeError("PostgreSQL durable enqueue outbox identity unexpectedly collided");
        return { ok: true, value: record };
      });
    },

    async readAuthority(scopeInput: ViraEnterpriseScope, executionId: string) {
      const scope = canonicalizeEnterpriseScope(scopeInput);
      if (!safeToken(executionId)) throw new TypeError("PostgreSQL durable authority execution id is invalid");
      return withTenantTransaction(pool, scope, async (client, transactionScope) => {
        const result = await client.query<AuthorityRow>(
          `SELECT organization_id, project_id, environment, execution_id, transaction_id, plan_digest,
                  plan_revision, operation_id, grant_id, grant_nonce, authority
             FROM vira.durable_execution_authority
            WHERE organization_id = $1 AND project_id = $2 AND environment = $3 AND execution_id = $4`,
          [transactionScope.organizationId, transactionScope.projectId, transactionScope.environment, executionId],
        );
        if (result.rows.length === 0) return undefined;
        if (result.rows.length !== 1) throw new TypeError("PostgreSQL durable authority read returned duplicate evidence");
        return validateAuthorityRow(result.rows[0]!, transactionScope, executionId);
      });
    },
  });
}
