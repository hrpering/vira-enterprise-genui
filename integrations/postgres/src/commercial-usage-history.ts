import type { ViraApplicationExactReference } from "../../../packages/application-package/src/index.js";
import {
  parseViraCommercialUsageBatch,
} from "../../../packages/commercial-metering/src/metering.js";
import {
  VIRA_COMMERCIAL_METERING_MAX_USAGE_RECORDS,
  type ViraCommercialUsageBatch,
} from "../../../packages/commercial-metering/src/types.js";
import type {
  ViraEnterprisePrincipal,
  ViraEnterpriseScope,
} from "../../../packages/enterprise-context/src/index.js";
import {
  withTenantTransaction,
  type PostgresPoolLike,
} from "./transaction.js";

export interface ViraPostgresCommercialUsageHistoryQuery {
  readonly scope: ViraEnterpriseScope;
  readonly applicationId: string;
  readonly applicationVersion: string;
  readonly entitlementRef: ViraApplicationExactReference;
  readonly meteringRef: ViraApplicationExactReference;
  readonly principal: ViraEnterprisePrincipal;
  readonly capabilityRef: ViraApplicationExactReference | null;
  readonly locationId: string | null;
  readonly asOf: string;
}

export interface ViraPostgresCommercialUsageHistoryRepository {
  readonly read: (
    input: ViraPostgresCommercialUsageHistoryQuery,
  ) => Promise<ViraCommercialUsageBatch>;
}

interface UsageRow extends Record<string, unknown> {
  readonly usage_record: unknown;
}

const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function canonicalUtc(value: unknown): string {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)) {
    throw new TypeError("PostgreSQL commercial usage history asOf must be canonical UTC");
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new TypeError("PostgreSQL commercial usage history asOf is invalid");
  }
  const canonical = new Date(milliseconds).toISOString();
  const normalized = value.includes(".") ? value : value.replace("Z", ".000Z");
  if (canonical !== normalized) {
    throw new TypeError("PostgreSQL commercial usage history asOf is not canonical");
  }
  return canonical;
}

export function createPostgresCommercialUsageHistoryRepository(
  pool: PostgresPoolLike,
): ViraPostgresCommercialUsageHistoryRepository {
  if (pool === null || typeof pool !== "object" || typeof pool.connect !== "function") {
    throw new TypeError("PostgreSQL commercial usage history repository requires a pool");
  }

  return Object.freeze({
    async read(
      input: ViraPostgresCommercialUsageHistoryQuery,
    ): Promise<ViraCommercialUsageBatch> {
      if (input === null || typeof input !== "object") {
        throw new TypeError("PostgreSQL commercial usage history query is invalid");
      }
      if (input.principal.organizationId !== input.scope.organizationId) {
        throw new TypeError("PostgreSQL commercial usage history principal conflicts with tenant scope");
      }
      const asOf = canonicalUtc(input.asOf);

      return withTenantTransaction(pool, input.scope, async (client, scope) => {
        const result = await client.query<UsageRow>(
          `SELECT usage_record
             FROM vira.commercial_usage_record
            WHERE organization_id = $1
              AND project_id = $2
              AND environment = $3
              AND application_id = $4
              AND application_version = $5
              AND entitlement_id = $6
              AND entitlement_version = $7
              AND metering_id = $8
              AND metering_version = $9
              AND principal_kind = $10
              AND principal_id = $11
              AND capability_id IS NOT DISTINCT FROM $12
              AND capability_version IS NOT DISTINCT FROM $13
              AND location_id IS NOT DISTINCT FROM $14
              AND occurred_at <= $15::timestamptz
            ORDER BY occurred_at ASC, usage_id ASC
            LIMIT ${VIRA_COMMERCIAL_METERING_MAX_USAGE_RECORDS + 1}`,
          [
            scope.organizationId,
            scope.projectId,
            scope.environment,
            input.applicationId,
            input.applicationVersion,
            input.entitlementRef.id,
            input.entitlementRef.versionRef,
            input.meteringRef.id,
            input.meteringRef.versionRef,
            input.principal.kind,
            input.principal.id,
            input.capabilityRef?.id ?? null,
            input.capabilityRef?.versionRef ?? null,
            input.locationId,
            asOf,
          ],
        );
        if (result.rows.length > VIRA_COMMERCIAL_METERING_MAX_USAGE_RECORDS) {
          throw new TypeError("PostgreSQL commercial usage history exceeds canonical batch limit");
        }
        const parsed = parseViraCommercialUsageBatch({
          schemaVersion: "1",
          records: result.rows.map((row) => row.usage_record),
        });
        if (!parsed.ok) {
          throw new TypeError(`PostgreSQL commercial usage history contains invalid canonical usage: ${parsed.issue.code}`);
        }
        return parsed.value;
      });
    },
  });
}
