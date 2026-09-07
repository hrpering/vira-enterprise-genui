import {
  parseViraCommercialInvoiceExport,
  type ViraCommercialInvoiceExport,
} from "../../../packages/commercial-pricing/src/index.js";
import type { ViraEnterprisePrincipal, ViraEnterpriseScope } from "../../../packages/enterprise-context/src/index.js";
import { withTenantTransaction, type PostgresPoolLike } from "./transaction.js";

export type ViraPostgresCommercialInvoiceExportSaveResult =
  | { readonly ok: true; readonly status: "accepted" | "duplicate"; readonly value: ViraCommercialInvoiceExport }
  | { readonly ok: false; readonly code: "EXPORT_CONFLICT" };

export interface ViraPostgresCommercialInvoiceExportQuery {
  readonly scope: ViraEnterpriseScope;
  readonly customer: ViraEnterprisePrincipal;
  readonly periodStart?: string;
  readonly periodEnd?: string;
  readonly limit?: number;
}

export interface ViraPostgresCommercialInvoiceExportRepository {
  readonly save: (scope: ViraEnterpriseScope, value: ViraCommercialInvoiceExport) => Promise<ViraPostgresCommercialInvoiceExportSaveResult>;
  readonly list: (query: ViraPostgresCommercialInvoiceExportQuery) => Promise<readonly ViraCommercialInvoiceExport[]>;
}

interface ExportRow extends Record<string, unknown> { readonly invoice_export: unknown }
interface ExactRow extends Record<string, unknown> { readonly exact_match: boolean }

const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function canonicalUtc(value: unknown, label: string): string {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)) throw new TypeError(`${label} must be canonical UTC`);
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new TypeError(`${label} is invalid`);
  const canonical = new Date(time).toISOString();
  if (canonical !== (value.includes(".") ? value : value.replace("Z", ".000Z"))) throw new TypeError(`${label} is not canonical`);
  return canonical;
}

export function createPostgresCommercialInvoiceExportRepository(
  pool: PostgresPoolLike,
): ViraPostgresCommercialInvoiceExportRepository {
  if (pool === null || typeof pool !== "object" || typeof pool.connect !== "function") {
    throw new TypeError("PostgreSQL commercial invoice export repository requires a pool");
  }
  return Object.freeze({
    async save(scope: ViraEnterpriseScope, input: ViraCommercialInvoiceExport): Promise<ViraPostgresCommercialInvoiceExportSaveResult> {
      const parsed = parseViraCommercialInvoiceExport(input);
      if (!parsed.ok) throw new TypeError(`PostgreSQL commercial invoice export is invalid: ${parsed.issue.code}`);
      const value = parsed.value;
      if (value.scope.organizationId !== scope.organizationId || value.scope.projectId !== scope.projectId || value.scope.environment !== scope.environment) {
        throw new TypeError("PostgreSQL commercial invoice export conflicts with tenant scope");
      }
      return withTenantTransaction(pool, scope, async (client, tenant) => {
        const inserted = await client.query<ExportRow>(
          `INSERT INTO vira.commercial_invoice_export (
             organization_id, project_id, environment, export_id, revision,
             customer_kind, customer_id, period_start, period_end, currency,
             plan_id, plan_version, source_set_digest, content_digest,
             total_amount_nanos, created_at, invoice_export
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9::timestamptz,$10,$11,$12,$13,$14,$15,$16::timestamptz,$17::jsonb)
           ON CONFLICT (organization_id, project_id, environment, export_id, revision) DO NOTHING
           RETURNING invoice_export`,
          [tenant.organizationId, tenant.projectId, tenant.environment, value.exportId, value.revision,
            value.customer.kind, value.customer.id, value.periodStart, value.periodEnd, value.currency,
            value.planRef.id, value.planRef.versionRef, value.sourceSetDigest, value.contentDigest,
            value.totalAmountNanos, value.createdAt, JSON.stringify(value)],
        );
        if (inserted.rows.length === 1) return { ok: true, status: "accepted", value };
        if (inserted.rows.length !== 0) throw new TypeError("PostgreSQL commercial invoice export insert returned invalid row count");
        const existing = await client.query<ExactRow>(
          `SELECT invoice_export = $6::jsonb AS exact_match
             FROM vira.commercial_invoice_export
            WHERE organization_id=$1 AND project_id=$2 AND environment=$3 AND export_id=$4 AND revision=$5`,
          [tenant.organizationId, tenant.projectId, tenant.environment, value.exportId, value.revision, JSON.stringify(value)],
        );
        return existing.rows.length === 1 && existing.rows[0]?.exact_match === true
          ? { ok: true, status: "duplicate", value }
          : { ok: false, code: "EXPORT_CONFLICT" };
      });
    },

    async list(query: ViraPostgresCommercialInvoiceExportQuery): Promise<readonly ViraCommercialInvoiceExport[]> {
      if (query.customer.organizationId !== query.scope.organizationId) throw new TypeError("PostgreSQL invoice export customer conflicts with tenant scope");
      const periodStart = query.periodStart === undefined ? null : canonicalUtc(query.periodStart, "periodStart");
      const periodEnd = query.periodEnd === undefined ? null : canonicalUtc(query.periodEnd, "periodEnd");
      if (periodStart !== null && periodEnd !== null && periodStart >= periodEnd) throw new TypeError("PostgreSQL invoice export query period is invalid");
      const limit = query.limit ?? 100;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new TypeError("PostgreSQL invoice export query limit is invalid");
      return withTenantTransaction(pool, query.scope, async (client, tenant) => {
        const result = await client.query<ExportRow>(
          `SELECT invoice_export FROM vira.commercial_invoice_export
            WHERE organization_id=$1 AND project_id=$2 AND environment=$3
              AND customer_kind=$4 AND customer_id=$5
              AND ($6::timestamptz IS NULL OR period_end > $6::timestamptz)
              AND ($7::timestamptz IS NULL OR period_start < $7::timestamptz)
            ORDER BY period_start DESC, period_end DESC, export_id ASC, revision DESC
            LIMIT $8`,
          [tenant.organizationId, tenant.projectId, tenant.environment, query.customer.kind, query.customer.id, periodStart, periodEnd, limit],
        );
        return Object.freeze(result.rows.map((row) => {
          const parsed = parseViraCommercialInvoiceExport(row.invoice_export);
          if (!parsed.ok) throw new TypeError(`PostgreSQL contains invalid commercial invoice export: ${parsed.issue.code}`);
          return parsed.value;
        }));
      });
    },
  });
}
