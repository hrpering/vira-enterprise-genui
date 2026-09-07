import type { ViraEnterpriseScope } from "../../../packages/enterprise-context/src/index.js";
import {
  canonicalizeEnterpriseScope,
  withTenantTransaction,
  type PostgresPoolLike,
} from "./transaction.js";

interface ExpiredExecutionRow extends Record<string, unknown> {
  readonly execution_id: unknown;
  readonly revision: unknown;
  readonly db_now_epoch_ms: unknown;
}

export interface ViraPostgresDurableExecutionRecoveryCandidate {
  readonly executionId: string;
  readonly expectedRevision: number;
  readonly nowEpochMs: number;
}

export interface ViraPostgresDurableExecutionRecoveryScanner {
  readonly findNextExpired: (
    scope: ViraEnterpriseScope,
  ) => Promise<ViraPostgresDurableExecutionRecoveryCandidate | undefined>;
}

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/;

function safeToken(value: unknown): value is string {
  return typeof value === "string" && SAFE_TOKEN.test(value) && value.trim() === value;
}

function rowPositiveInteger(value: unknown): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^[1-9][0-9]*$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  }
  throw new TypeError("PostgreSQL durable recovery scanner integer is invalid");
}

export function createPostgresDurableExecutionRecoveryScanner(
  pool: PostgresPoolLike,
): ViraPostgresDurableExecutionRecoveryScanner {
  if (pool === null || typeof pool !== "object" || typeof pool.connect !== "function") {
    throw new TypeError("PostgreSQL durable recovery scanner requires a pool");
  }

  return Object.freeze({
    async findNextExpired(scopeInput: ViraEnterpriseScope) {
      const scope = canonicalizeEnterpriseScope(scopeInput);
      return withTenantTransaction(pool, scope, async (client, transactionScope) => {
        const result = await client.query<ExpiredExecutionRow>(
          `SELECT execution_id,
                  revision,
                  (floor(extract(epoch FROM clock_timestamp()) * 1000))::bigint AS db_now_epoch_ms
             FROM vira.durable_execution_state
            WHERE organization_id = $1 AND project_id = $2 AND environment = $3
              AND status = 'executing'
              AND lease_expires_at IS NOT NULL
              AND lease_expires_at <= clock_timestamp()
            ORDER BY lease_expires_at, persistence_created_at, execution_id
            FOR UPDATE SKIP LOCKED
            LIMIT 1`,
          [transactionScope.organizationId, transactionScope.projectId, transactionScope.environment],
        );
        if (result.rows.length === 0) return undefined;
        if (result.rows.length !== 1) throw new TypeError("PostgreSQL durable recovery scanner returned multiple rows");
        const row = result.rows[0]!;
        if (!safeToken(row.execution_id)) {
          throw new TypeError("PostgreSQL durable recovery scanner execution id is invalid");
        }
        return Object.freeze({
          executionId: row.execution_id,
          expectedRevision: rowPositiveInteger(row.revision),
          nowEpochMs: rowPositiveInteger(row.db_now_epoch_ms),
        });
      });
    },
  });
}
