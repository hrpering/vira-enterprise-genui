import { describe, expect, it } from "vitest";
import {
  parseViraCommercialMeterCatalog,
  parseViraCommercialUsageBatch,
  rateViraCommercialUsage,
  serializeViraCommercialMeterCatalog,
  serializeViraCommercialUsageBatch,
} from "../../packages/commercial-metering/src/index.js";

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
      entitlementRefs: [{ id: "entitlement.refund-enterprise", versionRef: "1" }],
      meteringRefs: [
        { id: "metering.refund-invocations", versionRef: "1" },
        { id: "metering.refund-tokens", versionRef: "1" },
      ],
    },
  };
}

function entitlement(overrides: Record<string, unknown> = {}) {
  return {
    entitlementRef: { id: "entitlement.refund-enterprise", versionRef: "1" },
    subject: { organizationId: "contoso", principal: null },
    target: { applicationId: "demo.refund-app", applicationVersion: "1.0.0", capabilityRef: null },
    scope: { projectId: null, environment: null, locationId: null },
    planRef: { id: "plan.enterprise", versionRef: "1" },
    limits: [{ meteringRef: { id: "metering.refund-invocations", versionRef: "1" }, quantity: 100 }],
    commercialAccess: "enabled",
    ...overrides,
  };
}

function entitlementSet(entitlements = [entitlement()]) {
  return { schemaVersion: "1", entitlements };
}

function catalog(meters = [
  { meteringRef: { id: "metering.refund-invocations", versionRef: "1" }, unit: "count", window: "utc-month" },
  { meteringRef: { id: "metering.refund-tokens", versionRef: "1" }, unit: "token", window: "utc-day" },
]) {
  return { schemaVersion: "1", meters };
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    usageId: "usage-1",
    sourceId: "host.reference",
    occurredAt: "2026-09-05T10:00:00Z",
    applicationId: "demo.refund-app",
    applicationVersion: "1.0.0",
    entitlementRef: { id: "entitlement.refund-enterprise", versionRef: "1" },
    meteringRef: { id: "metering.refund-invocations", versionRef: "1" },
    principal: { version: "1", kind: "user", id: "user-1", organizationId: "contoso" },
    scope: { version: "1", organizationId: "contoso", projectId: "refunds", environment: "production" },
    capabilityRef: { id: "refund.analysis", versionRef: "1" },
    locationId: "eu",
    quantity: 25,
    ...overrides,
  };
}

function usage(records = [record()]) {
  return { schemaVersion: "1", records };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    application: application(),
    entitlementRef: { id: "entitlement.refund-enterprise", versionRef: "1" },
    principal: { version: "1", kind: "user", id: "user-1", organizationId: "contoso" },
    scope: { version: "1", organizationId: "contoso", projectId: "refunds", environment: "production" },
    capabilityRef: { id: "refund.analysis", versionRef: "1" },
    locationId: "eu",
    meteringRef: { id: "metering.refund-invocations", versionRef: "1" },
    asOf: "2026-09-05T12:00:00Z",
    usage: usage(),
    ...overrides,
  };
}

describe("Vira Commercial Metering v1", () => {
  it("parses meter catalogs into deterministic frozen exact definitions", () => {
    const result = parseViraCommercialMeterCatalog(catalog());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.meters)).toBe(true);
    expect(Object.isFrozen(result.value.meters[0])).toBe(true);
    expect(result.value.meters.map((meter) => meter.meteringRef.id)).toEqual([
      "metering.refund-invocations",
      "metering.refund-tokens",
    ]);
  });

  it("parses usage records as idempotent provenance-bearing commercial data", () => {
    const result = parseViraCommercialUsageBatch(usage([
      record({ usageId: "usage-2", occurredAt: "2026-09-05T11:00:00Z" }),
      record({ usageId: "usage-1", occurredAt: "2026-09-05T10:00:00Z" }),
    ]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.records.map((entry) => entry.usageId)).toEqual(["usage-1", "usage-2"]);
    expect(result.value.records[0]?.occurredAt).toBe("2026-09-05T10:00:00.000Z");
    expect(Object.isFrozen(result.value.records[0])).toBe(true);
  });

  it("rates in-window usage against the canonical entitlement limit", () => {
    const result = rateViraCommercialUsage(catalog(), entitlementSet(), request({
      usage: usage([
        record({ usageId: "usage-1", quantity: 25 }),
        record({ usageId: "usage-2", occurredAt: "2026-09-05T11:00:00Z", quantity: 30 }),
      ]),
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      meteringRef: { id: "metering.refund-invocations", versionRef: "1" },
      unit: "count",
      window: "utc-month",
      windowStart: "2026-09-01T00:00:00.000Z",
      windowEnd: "2026-10-01T00:00:00.000Z",
      asOf: "2026-09-05T12:00:00.000Z",
      includedRecordCount: 2,
      usedQuantity: 55,
      limitQuantity: 100,
      remainingQuantity: 45,
      excessQuantity: 0,
      status: "within-limit",
    });
  });

  it("reports limit-reached and over-limit without granting or denying execution", () => {
    const reached = rateViraCommercialUsage(catalog(), entitlementSet(), request({
      usage: usage([record({ quantity: 100 })]),
    }));
    expect(reached.ok).toBe(true);
    if (reached.ok) expect(reached.value).toMatchObject({ status: "limit-reached", remainingQuantity: 0, excessQuantity: 0 });

    const over = rateViraCommercialUsage(catalog(), entitlementSet(), request({
      usage: usage([record({ quantity: 125 })]),
    }));
    expect(over.ok).toBe(true);
    if (!over.ok) return;
    expect(over.value).toMatchObject({ status: "over-limit", remainingQuantity: 0, excessQuantity: 25 });
    expect("authorized" in over.value).toBe(false);
    expect("allow" in over.value).toBe(false);
    expect("deny" in over.value).toBe(false);
    expect("charge" in over.value).toBe(false);
  });

  it("treats a declared meter with no entitlement limit as unlimited", () => {
    const unlimitedEntitlement = entitlement({ limits: [] });
    const result = rateViraCommercialUsage(catalog(), entitlementSet([unlimitedEntitlement]), request());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      status: "unlimited",
      usedQuantity: 25,
      limitQuantity: null,
      remainingQuantity: null,
      excessQuantity: 0,
    });
  });

  it("uses deterministic UTC day windows and excludes same-context records outside the window or after asOf", () => {
    const tokenRequest = request({
      meteringRef: { id: "metering.refund-tokens", versionRef: "1" },
      usage: usage([
        record({
          usageId: "old",
          meteringRef: { id: "metering.refund-tokens", versionRef: "1" },
          occurredAt: "2026-09-04T23:59:59Z",
          quantity: 10,
        }),
        record({
          usageId: "current",
          meteringRef: { id: "metering.refund-tokens", versionRef: "1" },
          occurredAt: "2026-09-05T10:00:00Z",
          quantity: 20,
        }),
        record({
          usageId: "future",
          meteringRef: { id: "metering.refund-tokens", versionRef: "1" },
          occurredAt: "2026-09-05T13:00:00Z",
          quantity: 30,
        }),
      ]),
    });
    const result = rateViraCommercialUsage(catalog(), entitlementSet(), tokenRequest);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      unit: "token",
      window: "utc-day",
      windowStart: "2026-09-05T00:00:00.000Z",
      windowEnd: "2026-09-06T00:00:00.000Z",
      includedRecordCount: 1,
      usedQuantity: 20,
      status: "unlimited",
    });
  });

  it("rates lifetime meters without manufacturing time boundaries", () => {
    const lifetimeCatalog = catalog([
      { meteringRef: { id: "metering.refund-invocations", versionRef: "1" }, unit: "count", window: "lifetime" },
    ]);
    const result = rateViraCommercialUsage(lifetimeCatalog, entitlementSet(), request({
      usage: usage([
        record({ usageId: "old", occurredAt: "2025-01-01T00:00:00Z", quantity: 5 }),
        record({ usageId: "now", quantity: 10 }),
      ]),
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ windowStart: null, windowEnd: null, usedQuantity: 15, remainingQuantity: 85 });
  });

  it("requires commercial entitlement before rating usage", () => {
    const result = rateViraCommercialUsage(
      catalog(),
      entitlementSet([entitlement({ commercialAccess: "disabled" })]),
      request(),
    );
    expect(result).toMatchObject({ ok: false, issue: { code: "NOT_ENTITLED" } });
  });

  it("rejects undeclared or missing exact meter definitions", () => {
    const undeclared = rateViraCommercialUsage(catalog(), entitlementSet(), request({
      meteringRef: { id: "metering.other", versionRef: "1" },
    }));
    expect(undeclared).toMatchObject({ ok: false, issue: { code: "UNDECLARED_METERING" } });

    const missing = rateViraCommercialUsage(
      catalog([{ meteringRef: { id: "metering.refund-tokens", versionRef: "1" }, unit: "token", window: "utc-day" }]),
      entitlementSet(),
      request(),
    );
    expect(missing).toMatchObject({ ok: false, issue: { code: "METER_NOT_FOUND" } });
  });

  it("fails closed when a supplied usage record belongs to another commercial context", () => {
    const result = rateViraCommercialUsage(catalog(), entitlementSet(), request({
      usage: usage([record({ scope: { version: "1", organizationId: "contoso", projectId: "other", environment: "production" } })]),
    }));
    expect(result).toMatchObject({ ok: false, issue: { code: "USAGE_SCOPE_MISMATCH" } });
  });

  it("serializes meter and usage inputs deterministically independent of input order", () => {
    const meters = catalog([
      { meteringRef: { id: "metering.refund-tokens", versionRef: "1" }, unit: "token", window: "utc-day" },
      { meteringRef: { id: "metering.refund-invocations", versionRef: "1" }, unit: "count", window: "utc-month" },
    ]);
    const firstMeter = serializeViraCommercialMeterCatalog(meters);
    const secondMeter = serializeViraCommercialMeterCatalog(catalog());
    expect(firstMeter.ok).toBe(true);
    expect(secondMeter.ok).toBe(true);
    if (firstMeter.ok && secondMeter.ok) expect(firstMeter.value).toBe(secondMeter.value);

    const firstUsage = serializeViraCommercialUsageBatch(usage([
      record({ usageId: "usage-2", occurredAt: "2026-09-05T11:00:00Z" }),
      record({ usageId: "usage-1", occurredAt: "2026-09-05T10:00:00Z" }),
    ]));
    const secondUsage = serializeViraCommercialUsageBatch(usage([
      record({ usageId: "usage-1", occurredAt: "2026-09-05T10:00:00Z" }),
      record({ usageId: "usage-2", occurredAt: "2026-09-05T11:00:00Z" }),
    ]));
    expect(firstUsage.ok).toBe(true);
    expect(secondUsage.ok).toBe(true);
    if (firstUsage.ok && secondUsage.ok) expect(firstUsage.value).toBe(secondUsage.value);
  });
});
