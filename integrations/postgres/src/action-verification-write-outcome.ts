import {
  isViraDurableActionVerificationRecord,
  type ViraDurableActionVerificationRecord,
} from "../../../packages/action-verification/src/durable.js";
import {
  recordViraVerificationWriteOutcome,
  type ViraVerificationWriteOutcome,
} from "../../../packages/action-verification/src/write-outcome.js";
import type { ViraEnterpriseScope } from "../../../packages/enterprise-context/src/index.js";
import { parseJsonValue, type JsonObject, type JsonValue } from "../../../packages/protocol/src/index.js";
import {
  canonicalizeEnterpriseScope,
  withTenantTransaction,
  type PostgresPoolLike,
} from "./transaction.js";

interface VerificationOutcomeRow extends Record<string, unknown> {
  readonly revision: unknown;
  readonly status: unknown;
  readonly lease_epoch: unknown;
  readonly lease_worker_id: unknown;
  readonly lease_live: unknown;
  readonly record: unknown;
}

interface EpochRow extends Record<string, unknown> {
  readonly now_epoch_ms: unknown;
}

export interface ViraPostgresActionVerificationWriteOutcomeStore {
  readonly record: (input: {
    readonly scope: ViraEnterpriseScope;
    readonly verificationId: string;
    readonly workerId: string;
    readonly leaseEpoch: number;
    readonly expectedRevision: number;
    readonly outcome: ViraVerificationWriteOutcome;
  }) => Promise<
    | { readonly ok: true; readonly value: ViraDurableActionVerificationRecord }
    | { readonly ok: false; readonly code: "NOT_FOUND" | "VERSION_CONFLICT" | "INVALID_STATE" }
  >;
}

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/;

function safeToken(value: unknown): value is string {
  return typeof value === "string" && SAFE_TOKEN.test(value) && value.trim() === value;
}

function integer(value: unknown, allowZero = false): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && (allowZero ? value >= 0 : value > 0)) return value;
  if (typeof value === "string" && /^(?:0|[1-9][0-9]*)$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && (allowZero ? parsed >= 0 : parsed > 0)) return parsed;
  }
  throw new TypeError("PostgreSQL verification write outcome integer is invalid");
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseRecord(input: unknown): ViraDurableActionVerificationRecord {
  const parsed = parseJsonValue(input, "$.record");
  if (!parsed.ok || !isObject(parsed.value) || !isViraDurableActionVerificationRecord(parsed.value)) {
    throw new TypeError("PostgreSQL verification write outcome record is invalid");
  }
  return Object.freeze({
    ...parsed.value,
    scope: canonicalizeEnterpriseScope(parsed.value.scope),
    lease: parsed.value.lease === null ? null : Object.freeze({ ...parsed.value.lease }),
  }) as unknown as ViraDurableActionVerificationRecord;
}

export function createPostgresActionVerificationWriteOutcomeStore(
  pool: PostgresPoolLike,
): ViraPostgresActionVerificationWriteOutcomeStore {
  if (pool === null || typeof pool !== "object" || typeof pool.connect !== "function") {
    throw new TypeError("PostgreSQL verification write outcome store requires a pool");
  }
  return Object.freeze({
    async record(
      input: Parameters<ViraPostgresActionVerificationWriteOutcomeStore["record"]>[0],
    ): ReturnType<ViraPostgresActionVerificationWriteOutcomeStore["record"]> {
      const scope = canonicalizeEnterpriseScope(input.scope);
      if (!safeToken(input.verificationId) || !safeToken(input.workerId) || integer(input.leaseEpoch) !== input.leaseEpoch || integer(input.expectedRevision) !== input.expectedRevision) {
        throw new TypeError("PostgreSQL verification write outcome input is invalid");
      }
      return withTenantTransaction(pool, scope, async (client) => {
        const selected = await client.query<VerificationOutcomeRow>(
          `SELECT revision, status, lease_epoch, lease_worker_id, record,
                  (lease_expires_at > clock_timestamp()) AS lease_live
             FROM vira.action_verification_state
            WHERE organization_id=$1 AND project_id=$2 AND environment=$3 AND verification_id=$4
            FOR UPDATE`,
          [scope.organizationId, scope.projectId, scope.environment, input.verificationId],
        );
        if (selected.rows.length === 0) return { ok: false as const, code: "NOT_FOUND" as const };
        if (selected.rows.length !== 1) throw new TypeError("PostgreSQL verification write outcome returned duplicate state");
        const row = selected.rows[0]!;
        const record = parseRecord(row.record);
        if (
          record.verificationId !== input.verificationId
          || integer(row.revision) !== record.revision
          || row.status !== record.status
          || integer(row.lease_epoch, true) !== record.leaseEpoch
          || row.lease_worker_id !== record.lease?.workerId
        ) throw new TypeError("PostgreSQL verification write outcome row drifted from canonical record");
        if (record.revision !== input.expectedRevision) return { ok: false as const, code: "VERSION_CONFLICT" as const };
        if (row.lease_live !== true) return { ok: false as const, code: "INVALID_STATE" as const };

        const nowResult = await client.query<EpochRow>(
          "SELECT floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint AS now_epoch_ms",
        );
        if (nowResult.rows.length !== 1) throw new TypeError("PostgreSQL verification write outcome DB clock is unavailable");
        const next = recordViraVerificationWriteOutcome({
          record,
          workerId: input.workerId,
          leaseEpoch: input.leaseEpoch,
          expectedRevision: input.expectedRevision,
          nowEpochMs: integer(nowResult.rows[0]!.now_epoch_ms),
          outcome: input.outcome,
        });
        if (!next.ok) return { ok: false as const, code: "INVALID_STATE" as const };

        const updated = await client.query(
          `UPDATE vira.action_verification_state
              SET revision=$5, status=$6, lease_worker_id=NULL, lease_expires_at=NULL,
                  record=$7::jsonb, persistence_updated_at=clock_timestamp()
            WHERE organization_id=$1 AND project_id=$2 AND environment=$3 AND verification_id=$4
              AND revision=$8 AND lease_worker_id=$9 AND lease_epoch=$10
              AND lease_expires_at > clock_timestamp()`,
          [
            scope.organizationId,
            scope.projectId,
            scope.environment,
            input.verificationId,
            next.value.revision,
            next.value.status,
            JSON.stringify(next.value),
            input.expectedRevision,
            input.workerId,
            input.leaseEpoch,
          ],
        );
        if (updated.rowCount !== 1) return { ok: false as const, code: "VERSION_CONFLICT" as const };
        return { ok: true as const, value: next.value };
      });
    },
  });
}
