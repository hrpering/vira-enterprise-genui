import { describe, expect, it } from "vitest";
import {
  rateViraCommercialUsage,
  type ViraCommercialUsageRating,
} from "../../packages/commercial-metering/src/index.js";
import {
  evaluateViraCommercialBudgetQuotaPreflight,
  priceViraCommercialUsage,
} from "../../packages/commercial-pricing/src/index.js";
import {
  createPostgresCommercialUsageHistoryRepository,
  type PostgresClientLike,
  type PostgresPoolLike,
  type PostgresQueryResult,
} from "../../integrations/postgres/src/index.js";

const scope = Object.freeze({
  version: "1" as const,
  organizationId: "contoso",
  projectId: "refunds",
  environment: "production" as const,
});
const principal = Object.freeze({
  version: "1" as const,
  kind: "user" as const,
  id: "user-1",
  organizationId: "contoso",
});
const entitlementRef = Object.freeze({ id: "entitlement.refund-enterprise", versionRef: "1" });
const meteringRef = Object.freeze({ id: "metering.refund-actions", versionRef: "1" });
const planRef = Object.freeze({ id: "plan.enterprise", versionRef: "1" });
const AS_OF = "2026-09-07T12:00:00.000Z";

function application() {
  return {
    schemaVersion: "1",
    identity: { id: "demo.refund-app" },
    version: "1.0.0",
    publisher: { id: "demo", name: "Demo" },
    experiences: [],
    capabilities: [{ id: "refund.analysis", versionRef: "1" }],
    contextTypes: [],
    actions: [],
    flows: [],
    brandRef: null,
    governanceRequirements: [],
    hostCompatibility: { minViraVersion: "1.0.0", requiredCapabilities: [] },
    protocolProjections: [],
    distribution: { name: "Refund App", tags: [], visibility: "organization" as const, discoverable: true },
    commercial: {
      entitlementRefs: [entitlementRef],
      meteringRefs: [meteringRef],
    },
  };
}

function entitlementSet(limit = 5) {
  return {
    schemaVersion: "1",
    entitlements: [{
      entitlementRef,
      subject: { organizationId: "contoso", principal: null },
      target: { applicationId: "demo.refund-app", applicationVersion: "1.0.0", capabilityRef: null },
      scope: { projectId: null, environment: null, locationId: null },
      planRef,
      limits: [{ meteringRef, quantity: limit }],
      commercialAccess: "enabled",
    }],
  };
}

function meterCatalog() {
  return {
    schemaVersion: "1",
    meters: [{ meteringRef, unit: "count", window: "lifetime" }],
  };
}

function priceCatalog(amountNanosPerUnit = 10) {
  return {
    schemaVersion: "1",
    plans: [{
      planRef,
      currency: "USD",
      fixedAmountNanos: 100,
      rates: [{ meteringRef, basis: "used", amountNanosPerUnit }],
    }],
  };
}

function usage(usageId: string, occurredAt: string) {
  return {
    usageId,
    sourceId: "action.verification",
    occurredAt,
    applicationId: "demo.refund-app",
    applicationVersion: "1.0.0",
    entitlementRef,
    meteringRef,
    principal,
    scope,
    capabilityRef: null,
    locationId: null,
    quantity: 1,
  };
}

class FakeHistoryClient implements PostgresClientLike {
  readonly calls: Array<{ text: string; values: readonly unknown[] }> = [];
  released = false;

  readonly release = () => {
    this.released = true;
  };

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<PostgresQueryResult<Row>> {
    this.calls.push({ text, values });
    const sql = text.replace(/\s+/g, " ").trim();
    const rows: Record<string, unknown>[] = sql.includes("FROM vira.commercial_usage_record")
      ? [
          { usage_record: usage("usage-2", "2026-09-07T11:00:00.000Z") },
          { usage_record: usage("usage-1", "2026-09-07T10:00:00.000Z") },
        ]
      : [];
    return { rows: rows as Row[], rowCount: rows.length };
  }
}

function pool(client: FakeHistoryClient): PostgresPoolLike {
  return { async connect() { return client; } };
}

function policyDependencies(maxAmountNanos = 130, currency = "USD") {
  return {
    policySource: {
      resolve() {
        return {
          planRef,
          budget: { currency, maxAmountNanos },
        };
      },
    },
  };
}

function preflightRequest(rating: ViraCommercialUsageRating, overrides: Record<string, unknown> = {}) {
  return {
    asOf: AS_OF,
    ratings: [rating],
    proposal: { meteringRef, quantity: 1 },
    ...overrides,
  };
}

function canonicalRating(input: Partial<ViraCommercialUsageRating> = {}): ViraCommercialUsageRating {
  const base: ViraCommercialUsageRating = {
    meteringRef,
    unit: "count",
    window: "lifetime",
    windowStart: null,
    windowEnd: null,
    asOf: AS_OF,
    includedRecordCount: 1,
    usedQuantity: 1,
    limitQuantity: 5,
    remainingQuantity: 4,
    excessQuantity: 0,
    status: "within-limit",
  };
  return Object.freeze({ ...base, ...input });
}

describe("PROD-14 durable commercial rating/pricing/preflight chain", () => {
  it("reads canonical durable history in stable order and derives deterministic rating, quote and allowed preflight", async () => {
    const client = new FakeHistoryClient();
    const history = await createPostgresCommercialUsageHistoryRepository(pool(client)).read({
      scope,
      applicationId: "demo.refund-app",
      applicationVersion: "1.0.0",
      entitlementRef,
      meteringRef,
      principal,
      capabilityRef: null,
      locationId: null,
      asOf: AS_OF,
    });
    expect(history.records.map((record) => record.usageId)).toEqual(["usage-1", "usage-2"]);
    expect(client.calls.some((call) => call.text.includes("ORDER BY occurred_at ASC, usage_id ASC"))).toBe(true);
    expect(client.released).toBe(true);

    const rating = rateViraCommercialUsage(meterCatalog(), entitlementSet(), {
      application: application(),
      entitlementRef,
      principal,
      scope,
      capabilityRef: null,
      locationId: null,
      meteringRef,
      asOf: AS_OF,
      usage: history,
    });
    expect(rating.ok).toBe(true);
    if (!rating.ok) return;
    expect(rating.value).toMatchObject({ usedQuantity: 2, remainingQuantity: 3, status: "within-limit" });

    const quote = priceViraCommercialUsage(priceCatalog(), { planRef, asOf: AS_OF, ratings: [rating.value] });
    expect(quote.ok).toBe(true);
    if (quote.ok) expect(quote.value.totalAmountNanos).toBe(120);

    const preflight = await evaluateViraCommercialBudgetQuotaPreflight(
      priceCatalog(),
      preflightRequest(rating.value),
      policyDependencies(),
    );
    expect(preflight.ok).toBe(true);
    if (!preflight.ok) return;
    expect(preflight.value).toMatchObject({
      decision: "allowed",
      reason: "WITHIN_QUOTA_AND_BUDGET",
      proposedQuantity: 1,
    });
    expect(preflight.value.projectedRating).toMatchObject({ usedQuantity: 3, remainingQuantity: 2 });
    expect(preflight.value.projectedQuote?.totalAmountNanos).toBe(130);
    expect(rating.value.usedQuantity).toBe(2);
  });

  it("allows the final in-quota proposal that exactly reaches the limit", async () => {
    const rating = canonicalRating({ includedRecordCount: 4, usedQuantity: 4, remainingQuantity: 1 });
    const result = await evaluateViraCommercialBudgetQuotaPreflight(
      priceCatalog(),
      preflightRequest(rating),
      policyDependencies(10_000),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.decision).toBe("allowed");
    expect(result.value.projectedRating).toMatchObject({ usedQuantity: 5, status: "limit-reached" });
  });

  it("blocks when quota is already exhausted or the proposal would exceed it", async () => {
    const exhausted = canonicalRating({
      includedRecordCount: 5,
      usedQuantity: 5,
      remainingQuantity: 0,
      status: "limit-reached",
    });
    const exhaustedResult = await evaluateViraCommercialBudgetQuotaPreflight(
      priceCatalog(),
      preflightRequest(exhausted),
      policyDependencies(10_000),
    );
    expect(exhaustedResult).toMatchObject({ ok: true, value: { decision: "limit-reached", reason: "CURRENT_QUOTA_EXHAUSTED" } });

    const wouldExceed = canonicalRating({ includedRecordCount: 4, usedQuantity: 4, remainingQuantity: 1 });
    const exceedResult = await evaluateViraCommercialBudgetQuotaPreflight(
      priceCatalog(),
      preflightRequest(wouldExceed, { proposal: { meteringRef, quantity: 2 } }),
      policyDependencies(10_000),
    );
    expect(exceedResult).toMatchObject({ ok: true, value: { decision: "limit-reached", reason: "PROJECTED_QUOTA_EXCEEDED" } });
  });

  it("returns over-budget only from exact projected integer-nanos pricing", async () => {
    const rating = canonicalRating({ includedRecordCount: 2, usedQuantity: 2, remainingQuantity: 3 });
    const result = await evaluateViraCommercialBudgetQuotaPreflight(
      priceCatalog(),
      preflightRequest(rating),
      policyDependencies(129),
    );
    expect(result).toMatchObject({ ok: true, value: { decision: "over-budget", reason: "PROJECTED_BUDGET_EXCEEDED" } });
    if (result.ok) expect(result.value.projectedQuote?.totalAmountNanos).toBe(130);
  });

  it("returns insufficient-evidence for a missing canonical rating instead of inventing usage", async () => {
    const result = await evaluateViraCommercialBudgetQuotaPreflight(
      priceCatalog(),
      { asOf: AS_OF, ratings: [], proposal: { meteringRef, quantity: 1 } },
      policyDependencies(1_000),
    );
    expect(result).toMatchObject({ ok: true, value: { decision: "insufficient-evidence", reason: "MISSING_CANONICAL_RATING" } });
  });

  it("does not allow the request payload to select plan or budget authority", async () => {
    const rating = canonicalRating();
    const result = await evaluateViraCommercialBudgetQuotaPreflight(
      priceCatalog(),
      {
        ...preflightRequest(rating),
        planRef: { id: "plan.attacker", versionRef: "1" },
        budget: { currency: "USD", maxAmountNanos: Number.MAX_SAFE_INTEGER },
      },
      policyDependencies(),
    );
    expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_INPUT" } });
  });

  it("fails closed on policy source failure, currency drift and quantity overflow", async () => {
    const rating = canonicalRating({ includedRecordCount: 2, usedQuantity: 2, remainingQuantity: 3 });
    const policyFailure = await evaluateViraCommercialBudgetQuotaPreflight(
      priceCatalog(),
      preflightRequest(rating),
      { policySource: { resolve() { throw new Error("secret policy detail"); } } },
    );
    expect(policyFailure).toMatchObject({ ok: false, issue: { code: "POLICY_SOURCE_FAILED" } });

    const currency = await evaluateViraCommercialBudgetQuotaPreflight(
      priceCatalog(),
      preflightRequest(rating),
      policyDependencies(1_000, "EUR"),
    );
    expect(currency).toMatchObject({ ok: false, issue: { code: "CURRENCY_MISMATCH" } });

    const huge = canonicalRating({
      includedRecordCount: 1,
      usedQuantity: Number.MAX_SAFE_INTEGER,
      limitQuantity: null,
      remainingQuantity: null,
      excessQuantity: 0,
      status: "unlimited",
    });
    const overflow = await evaluateViraCommercialBudgetQuotaPreflight(
      priceCatalog(0),
      preflightRequest(huge),
      policyDependencies(1_000),
    );
    expect(overflow).toMatchObject({ ok: false, issue: { code: "QUANTITY_OVERFLOW" } });
  });
});
