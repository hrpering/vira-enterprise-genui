import {
  createViraActionProviderObservation,
  type ViraActionProviderObservation,
} from "../../../packages/action-verification/src/index.js";
import type { ViraEnterpriseScope } from "../../../packages/enterprise-context/src/index.js";
import {
  canonicalizeEnterpriseScope,
  withTenantTransaction,
  type PostgresPoolLike,
} from "./transaction.js";

interface ObservationRow extends Record<string, unknown> {
  readonly verification_id: unknown;
  readonly attempt_id: unknown;
  readonly phase: unknown;
  readonly observation: unknown;
}

export interface ViraPostgresActionVerificationObservationRepository {
  readonly readPhase: (input: {
    readonly scope: ViraEnterpriseScope;
    readonly verificationId: string;
    readonly attemptId: string;
    readonly phase: "before" | "after";
  }) => Promise<ViraActionProviderObservation | undefined>;
}

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/;

function safeToken(value: unknown): value is string {
  return typeof value === "string" && SAFE_TOKEN.test(value) && value.trim() === value;
}

function exactScope(left: ViraEnterpriseScope, right: ViraEnterpriseScope): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

export function createPostgresActionVerificationObservationRepository(
  pool: PostgresPoolLike,
): ViraPostgresActionVerificationObservationRepository {
  if (pool === null || typeof pool !== "object" || typeof pool.connect !== "function") {
    throw new TypeError("PostgreSQL verification observation repository requires a pool");
  }
  return Object.freeze({
    async readPhase(
      input: Parameters<ViraPostgresActionVerificationObservationRepository["readPhase"]>[0],
    ): ReturnType<ViraPostgresActionVerificationObservationRepository["readPhase"]> {
      const scope = canonicalizeEnterpriseScope(input.scope);
      if (!safeToken(input.verificationId) || !safeToken(input.attemptId) || (input.phase !== "before" && input.phase !== "after")) {
        throw new TypeError("PostgreSQL verification observation read input is invalid");
      }
      return withTenantTransaction(pool, scope, async (client) => {
        const result = await client.query<ObservationRow>(
          `SELECT verification_id, attempt_id, phase, observation
             FROM vira.action_verification_observation
            WHERE organization_id=$1 AND project_id=$2 AND environment=$3
              AND verification_id=$4 AND attempt_id=$5 AND phase=$6
            ORDER BY created_at ASC`,
          [scope.organizationId, scope.projectId, scope.environment, input.verificationId, input.attemptId, input.phase],
        );
        if (result.rows.length === 0) return undefined;
        if (result.rows.length !== 1) throw new TypeError("PostgreSQL verification observation phase is not unique");
        const row = result.rows[0]!;
        if (row.verification_id !== input.verificationId || row.attempt_id !== input.attemptId || row.phase !== input.phase) {
          throw new TypeError("PostgreSQL verification observation row identity drifted");
        }
        const observation = createViraActionProviderObservation(row.observation);
        if (!observation.ok || !exactScope(observation.value.scope, scope)) {
          throw new TypeError("PostgreSQL verification observation evidence is invalid");
        }
        return observation.value;
      });
    },
  });
}
