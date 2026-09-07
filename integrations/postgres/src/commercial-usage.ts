import type {
  ViraCommercialTrustedUsageSourceEvent,
} from "../../../packages/commercial-metering/src/trusted-source.js";
import {
  parseViraCommercialUsageBatch,
} from "../../../packages/commercial-metering/src/metering.js";
import type {
  ViraCommercialUsageRecord,
} from "../../../packages/commercial-metering/src/types.js";
import type { ViraEnterpriseScope } from "../../../packages/enterprise-context/src/index.js";
import {
  withTenantTransaction,
  type PostgresPoolLike,
} from "./transaction.js";

export type ViraPostgresCommercialUsageAppendResult =
  | {
      readonly ok: true;
      readonly status: "accepted" | "duplicate";
      readonly event: ViraCommercialTrustedUsageSourceEvent;
      readonly usage: ViraCommercialUsageRecord;
    }
  | {
      readonly ok: false;
      readonly code: "SOURCE_CONFLICT";
    };

export interface ViraPostgresCommercialUsageStore {
  readonly append: (input: Readonly<{
    readonly scope: ViraEnterpriseScope;
    readonly event: ViraCommercialTrustedUsageSourceEvent;
    readonly usage: ViraCommercialUsageRecord;
  }>) => Promise<ViraPostgresCommercialUsageAppendResult>;
}

interface TokenRow extends Record<string, unknown> {
  readonly token: unknown;
}

interface ExistingPairRow extends Record<string, unknown> {
  readonly exact_match: unknown;
}

function exactScope(left: ViraEnterpriseScope, right: ViraEnterpriseScope): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function sameRef(
  left: Readonly<{ id: string; versionRef: string }>,
  right: Readonly<{ id: string; versionRef: string }>,
): boolean {
  return left.id === right.id && left.versionRef === right.versionRef;
}

function exactPrincipal(
  left: ViraCommercialTrustedUsageSourceEvent["principal"],
  right: ViraCommercialUsageRecord["principal"],
): boolean {
  return left.version === right.version
    && left.kind === right.kind
    && left.id === right.id
    && left.organizationId === right.organizationId;
}

function validatePair(
  scope: ViraEnterpriseScope,
  event: ViraCommercialTrustedUsageSourceEvent,
  usage: ViraCommercialUsageRecord,
): ViraCommercialUsageRecord {
  const parsedUsage = parseViraCommercialUsageBatch({ schemaVersion: "1", records: [usage] });
  if (!parsedUsage.ok || parsedUsage.value.records.length !== 1) {
    throw new TypeError("PostgreSQL commercial usage append requires one canonical usage record");
  }
  const canonicalUsage = parsedUsage.value.records[0]!;
  if (
    event.version !== "1"
    || event.sourceKind !== "action.effect.verified"
    || event.sourceEventId !== canonicalUsage.usageId
    || canonicalUsage.sourceId !== "action.verification"
    || !exactScope(scope, event.scope)
    || !exactScope(scope, canonicalUsage.scope)
    || event.applicationId !== canonicalUsage.applicationId
    || event.applicationVersion !== canonicalUsage.applicationVersion
    || !sameRef(event.entitlementRef, canonicalUsage.entitlementRef)
    || !sameRef(event.meteringRef, canonicalUsage.meteringRef)
    || !exactPrincipal(event.principal, canonicalUsage.principal)
    || event.quantity !== canonicalUsage.quantity
    || event.quantity !== 1
    || event.locationId !== canonicalUsage.locationId
    || event.capabilityRef !== null
    || canonicalUsage.capabilityRef !== null
    || event.authority.kind !== "action-verification"
  ) {
    throw new TypeError("PostgreSQL commercial usage source event conflicts with canonical usage record");
  }
  return canonicalUsage;
}

export function createPostgresCommercialUsageStore(
  pool: PostgresPoolLike,
): ViraPostgresCommercialUsageStore {
  if (pool === null || typeof pool !== "object" || typeof pool.connect !== "function") {
    throw new TypeError("PostgreSQL commercial usage store requires a pool");
  }

  return Object.freeze({
    async append(
      input: Parameters<ViraPostgresCommercialUsageStore["append"]>[0],
    ): Promise<ViraPostgresCommercialUsageAppendResult> {
      if (input === null || typeof input !== "object") {
        throw new TypeError("PostgreSQL commercial usage append input is invalid");
      }
      const usage = validatePair(input.scope, input.event, input.usage);
      const event = input.event;

      return withTenantTransaction(pool, input.scope, async (client, scope) => {
        const insertedEvent = await client.query<TokenRow>(
          `INSERT INTO vira.commercial_usage_source_event
             (organization_id, project_id, environment, source_event_id, source_kind,
              verification_id, execution_id, transaction_id, operation_id, attempt_id,
              application_id, application_version, application_digest,
              entitlement_id, entitlement_version, metering_id, metering_version,
              quantity, occurred_at, event)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                   $11, $12, $13, $14, $15, $16, $17, $18, $19::timestamptz, $20::jsonb)
           ON CONFLICT DO NOTHING
           RETURNING source_event_id AS token`,
          [
            scope.organizationId,
            scope.projectId,
            scope.environment,
            event.sourceEventId,
            event.sourceKind,
            event.authority.verificationId,
            event.authority.executionId,
            event.authority.transactionId,
            event.authority.operationId,
            event.authority.attemptId,
            event.applicationId,
            event.applicationVersion,
            event.applicationDigest,
            event.entitlementRef.id,
            event.entitlementRef.versionRef,
            event.meteringRef.id,
            event.meteringRef.versionRef,
            event.quantity,
            event.occurredAt,
            JSON.stringify(event),
          ],
        );

        if (insertedEvent.rows.length === 1) {
          const insertedUsage = await client.query<TokenRow>(
            `INSERT INTO vira.commercial_usage_record
               (organization_id, project_id, environment, usage_id, source_event_id, source_id,
                occurred_at, application_id, application_version,
                entitlement_id, entitlement_version, metering_id, metering_version,
                principal_kind, principal_id, capability_id, capability_version,
                location_id, quantity, usage_record)
             VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8, $9,
                     $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20::jsonb)
             ON CONFLICT DO NOTHING
             RETURNING usage_id AS token`,
            [
              scope.organizationId,
              scope.projectId,
              scope.environment,
              usage.usageId,
              event.sourceEventId,
              usage.sourceId,
              usage.occurredAt,
              usage.applicationId,
              usage.applicationVersion,
              usage.entitlementRef.id,
              usage.entitlementRef.versionRef,
              usage.meteringRef.id,
              usage.meteringRef.versionRef,
              usage.principal.kind,
              usage.principal.id,
              usage.capabilityRef?.id ?? null,
              usage.capabilityRef?.versionRef ?? null,
              usage.locationId,
              usage.quantity,
              JSON.stringify(usage),
            ],
          );
          if (insertedUsage.rows.length !== 1) {
            throw new TypeError("PostgreSQL commercial usage record collided after source event insert");
          }
          return { ok: true, status: "accepted", event, usage };
        }

        if (insertedEvent.rows.length !== 0) {
          throw new TypeError("PostgreSQL commercial usage source insert returned duplicate rows");
        }

        const existing = await client.query<ExistingPairRow>(
          `SELECT (
             source.event = $5::jsonb
             AND usage.usage_record = $6::jsonb
             AND usage.source_event_id = source.source_event_id
           ) AS exact_match
           FROM vira.commercial_usage_source_event AS source
           LEFT JOIN vira.commercial_usage_record AS usage
             ON usage.organization_id = source.organization_id
            AND usage.project_id = source.project_id
            AND usage.environment = source.environment
            AND usage.source_event_id = source.source_event_id
           WHERE source.organization_id = $1
             AND source.project_id = $2
             AND source.environment = $3
             AND source.source_event_id = $4`,
          [
            scope.organizationId,
            scope.projectId,
            scope.environment,
            event.sourceEventId,
            JSON.stringify(event),
            JSON.stringify(usage),
          ],
        );
        if (existing.rows.length === 1 && existing.rows[0]?.exact_match === true) {
          return { ok: true, status: "duplicate", event, usage };
        }
        return { ok: false, code: "SOURCE_CONFLICT" };
      });
    },
  });
}
