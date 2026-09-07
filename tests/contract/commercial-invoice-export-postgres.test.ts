import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createViraCommercialInvoiceExport, type ViraCommercialInvoiceExport } from "../../packages/commercial-pricing/src/index.js";
import { createPostgresCommercialInvoiceExportRepository, type PostgresClientLike, type PostgresPoolLike, type PostgresQueryResult } from "../../integrations/postgres/src/index.js";

const scope = Object.freeze({ version: "1" as const, organizationId: "contoso", projectId: "billing", environment: "production" as const });
const customer = Object.freeze({ version: "1" as const, kind: "service" as const, id: "customer", organizationId: "contoso" });

async function invoice(): Promise<ViraCommercialInvoiceExport> {
  const result = await createViraCommercialInvoiceExport({
    exportId: "export-1", revision: 1, scope, customer,
    periodStart: "2026-09-01T00:00:00.000Z", periodEnd: "2026-10-01T00:00:00.000Z",
    applicationRefs: [{ id: "demo.billing", version: "1.0.0" }], usageLines: [],
    quote: { planRef: { id: "pricing.enterprise", versionRef: "1" }, currency: "USD", asOf: "2026-10-01T00:00:00.000Z", fixedAmountNanos: 100, lines: [], totalAmountNanos: 100 },
    settlementEvidenceRefs: [{ id: "settlement.enterprise", versionRef: "1" }], createdAt: "2026-10-01T00:00:01.000Z",
  }, { sha256: (value) => createHash("sha256").update(value).digest("hex") });
  if (!result.ok) throw new Error(result.issue.code);
  return result.value;
}

class Client implements PostgresClientLike {
  readonly calls: Array<{ text: string; values: readonly unknown[] }> = [];
  constructor(readonly mode: "accepted" | "duplicate" | "conflict" | "list", readonly stored: ViraCommercialInvoiceExport) {}
  release() {}
  async query<Row extends Record<string, unknown> = Record<string, unknown>>(text: string, values: readonly unknown[] = []): Promise<PostgresQueryResult<Row>> {
    this.calls.push({ text, values });
    const normalized = text.replace(/\s+/g, " ").trim();
    let rows: Record<string, unknown>[] = [];
    if (normalized.startsWith("INSERT INTO vira.commercial_invoice_export") && this.mode === "accepted") rows = [{ invoice_export: this.stored }];
    if (normalized.startsWith("SELECT invoice_export =")) rows = [{ exact_match: this.mode === "duplicate" }];
    if (normalized.startsWith("SELECT invoice_export FROM")) rows = [{ invoice_export: this.stored }];
    return { rows: rows as Row[], rowCount: rows.length };
  }
}

function pool(client: Client): PostgresPoolLike { return { async connect() { return client; } }; }

describe("PostgreSQL commercial invoice export repository", () => {
  it("inserts immutable export evidence with tenant scope", async () => {
    const stored = await invoice(); const client = new Client("accepted", stored);
    const result = await createPostgresCommercialInvoiceExportRepository(pool(client)).save(scope, stored);
    expect(result).toMatchObject({ ok: true, status: "accepted" });
    expect(client.calls.some((call) => call.text.includes("ON CONFLICT") && call.text.includes("DO NOTHING"))).toBe(true);
    expect(client.calls[1]?.values).toEqual(["contoso", "billing", "production"]);
  });

  it("distinguishes exact duplicate from conflicting immutable identity", async () => {
    const stored = await invoice();
    expect(await createPostgresCommercialInvoiceExportRepository(pool(new Client("duplicate", stored))).save(scope, stored)).toMatchObject({ ok: true, status: "duplicate" });
    expect(await createPostgresCommercialInvoiceExportRepository(pool(new Client("conflict", stored))).save(scope, stored)).toEqual({ ok: false, code: "EXPORT_CONFLICT" });
  });

  it("lists canonical exports in stable repository order", async () => {
    const stored = await invoice(); const client = new Client("list", stored);
    const result = await createPostgresCommercialInvoiceExportRepository(pool(client)).list({ scope, customer, limit: 25 });
    expect(result).toEqual([stored]);
    expect(client.calls.some((call) => call.text.includes("ORDER BY period_start DESC") && call.values.at(-1) === 25)).toBe(true);
  });

  it("rejects cross-tenant writes before opening a transaction", async () => {
    const stored = await invoice(); const client = new Client("accepted", stored);
    await expect(createPostgresCommercialInvoiceExportRepository(pool(client)).save({ ...scope, organizationId: "other" }, stored)).rejects.toThrow("conflicts with tenant scope");
    expect(client.calls).toHaveLength(0);
  });
});
