import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createViraCommercialInvoiceExport,
  parseViraCommercialInvoiceExport,
  serializeViraCommercialInvoiceExport,
  verifyViraCommercialInvoiceExport,
  type ViraCommercialInvoiceExportInput,
} from "../../packages/commercial-pricing/src/index.js";

const scope = Object.freeze({
  version: "1" as const,
  organizationId: "contoso",
  projectId: "payments",
  environment: "production" as const,
});
const customer = Object.freeze({
  version: "1" as const,
  kind: "service" as const,
  id: "customer-service",
  organizationId: "contoso",
});
const planRef = Object.freeze({ id: "pricing.enterprise", versionRef: "2026-09" });
const meteringRef = Object.freeze({ id: "metering.verified-write", versionRef: "1" });
const entitlementRef = Object.freeze({ id: "entitlement.enterprise", versionRef: "1" });
const settlementRef = Object.freeze({ id: "settlement.publisher-share", versionRef: "1" });
const digestProvider = Object.freeze({
  sha256(input: string) {
    return createHash("sha256").update(input).digest("hex");
  },
});

function usage(usageId: string, occurredAt: string) {
  return {
    usageId,
    sourceId: "action.verification",
    occurredAt,
    applicationId: "demo.billing-app",
    applicationVersion: "1.0.0",
    entitlementRef,
    meteringRef,
    principal: customer,
    scope,
    capabilityRef: null,
    locationId: null,
    quantity: 1,
  };
}

function line(sourceEventId: string, usageId: string, occurredAt: string, providerId: string | null = null) {
  return {
    sourceEventId,
    usage: usage(usageId, occurredAt),
    attribution: {
      publisherId: "demo",
      providerId,
      modelId: null,
      nodeId: null,
      platformId: "vira",
    },
  };
}

function input(overrides: Partial<ViraCommercialInvoiceExportInput> = {}): ViraCommercialInvoiceExportInput {
  return {
    exportId: "invoice-export-2026-09",
    revision: 1,
    scope,
    customer,
    periodStart: "2026-09-01T00:00:00.000Z",
    periodEnd: "2026-10-01T00:00:00.000Z",
    applicationRefs: [{ id: "demo.billing-app", version: "1.0.0" }],
    usageLines: [
      line("source-2", "source-2", "2026-09-03T00:00:00.000Z", "github"),
      line("source-1", "source-1", "2026-09-02T00:00:00.000Z"),
    ],
    quote: {
      planRef,
      currency: "USD",
      asOf: "2026-10-01T00:00:00.000Z",
      fixedAmountNanos: 100,
      lines: [{
        meteringRef,
        unit: "count",
        window: "utc-month",
        basis: "used",
        quantity: 2,
        amountNanosPerUnit: 10,
        amountNanos: 20,
      }],
      totalAmountNanos: 120,
    },
    settlementEvidenceRefs: [settlementRef],
    createdAt: "2026-10-01T00:00:01.000Z",
    ...overrides,
  };
}

describe("commercial invoice-grade export", () => {
  it("creates stable canonical content independent of input order and business revision identity", async () => {
    const first = await createViraCommercialInvoiceExport(input(), digestProvider);
    const second = await createViraCommercialInvoiceExport(input({
      exportId: "invoice-export-retry",
      revision: 2,
      createdAt: "2026-10-01T00:01:00.000Z",
      usageLines: [...input().usageLines].reverse(),
    }), digestProvider);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.sourceSetDigest).toBe(second.value.sourceSetDigest);
    expect(first.value.contentDigest).toBe(second.value.contentDigest);
    expect(first.value.usageLines.map((entry) => entry.sourceEventId)).toEqual(["source-1", "source-2"]);
    expect(first.value.subtotalNanos).toBe(120);
    expect(first.value.totalAmountNanos).toBe(120);
    expect(first.value.usageLines[0]?.attribution.providerId).toBeNull();
    expect((first.value as unknown as Record<string, unknown>).paymentStatus).toBeUndefined();
  });

  it("parses, serializes and verifies immutable digest evidence", async () => {
    const created = await createViraCommercialInvoiceExport(input(), digestProvider);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(parseViraCommercialInvoiceExport(created.value)).toEqual(created);
    const serialized = serializeViraCommercialInvoiceExport(created.value);
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) return;
    expect(JSON.parse(serialized.value)).toEqual(created.value);
    expect((await verifyViraCommercialInvoiceExport(created.value, digestProvider)).ok).toBe(true);
    expect(await verifyViraCommercialInvoiceExport({ ...created.value, totalAmountNanos: 121 }, digestProvider)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_QUOTE" },
    });
    expect(await verifyViraCommercialInvoiceExport({ ...created.value, contentDigest: "f".repeat(64) }, digestProvider)).toMatchObject({
      ok: false,
      issue: { code: "CONTENT_DIGEST_MISMATCH" },
    });
  });

  it("rejects duplicate, out-of-period, cross-tenant and floating evidence", async () => {
    const duplicate = input({ usageLines: [line("same", "same", "2026-09-02T00:00:00.000Z"), line("same", "same", "2026-09-03T00:00:00.000Z")] });
    expect(await createViraCommercialInvoiceExport(duplicate, digestProvider)).toMatchObject({ ok: false, issue: { code: "DUPLICATE_USAGE" } });
    expect(await createViraCommercialInvoiceExport(input({ usageLines: [line("source", "source", "2026-10-02T00:00:00.000Z")] }), digestProvider)).toMatchObject({ ok: false, issue: { code: "USAGE_PERIOD_MISMATCH" } });
    expect(await createViraCommercialInvoiceExport(input({ customer: { ...customer, organizationId: "other" } }), digestProvider)).toMatchObject({ ok: false, issue: { code: "INVALID_PRINCIPAL" } });
    expect(await createViraCommercialInvoiceExport(input({ settlementEvidenceRefs: [{ id: settlementRef.id, versionRef: "latest" }] }), digestProvider)).toMatchObject({ ok: false, issue: { code: "FLOATING_REFERENCE" } });
  });

  it("rejects invalid currency evidence and unsafe monetary values", async () => {
    expect(await createViraCommercialInvoiceExport(input({ quote: { ...input().quote, currency: "usd" } }), digestProvider)).toMatchObject({ ok: false, issue: { code: "INVALID_QUOTE" } });
    expect(await createViraCommercialInvoiceExport(input({ quote: { ...input().quote, fixedAmountNanos: Number.MAX_SAFE_INTEGER, totalAmountNanos: Number.MAX_SAFE_INTEGER } }), digestProvider)).toMatchObject({ ok: false, issue: { code: "INVALID_QUOTE" } });
  });
});
