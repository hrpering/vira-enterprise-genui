import { describe, expect, it } from "vitest";
import {
  VIRA_COMMERCIAL_METERING_MAX_METERS,
  VIRA_COMMERCIAL_METERING_MAX_USAGE_RECORDS,
  parseViraCommercialMeterCatalog,
  parseViraCommercialUsageBatch,
  rateViraCommercialUsage,
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
      meteringRefs: [{ id: "metering.refund-invocations", versionRef: "1" }],
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
    quantity: 1,
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

describe("Vira Commercial Metering v1 hardening", () => {
  it("rejects floating meter, entitlement and Capability references", () => {
    expect(parseViraCommercialMeterCatalog(catalog([
      { meteringRef: { id: "metering.refund-invocations", versionRef: "latest" }, unit: "count", window: "utc-month" },
    ]))).toMatchObject({ ok: false, issue: { code: "FLOATING_REFERENCE" } });

    expect(parseViraCommercialUsageBatch(usage([record({
      entitlementRef: { id: "entitlement.refund-enterprise", versionRef: "1.x" },
    })]))).toMatchObject({ ok: false, issue: { code: "FLOATING_REFERENCE" } });

    expect(rateViraCommercialUsage(catalog(), entitlementSet(), request({
      capabilityRef: { id: "refund.analysis", versionRef: "current" },
    }))).toMatchObject({ ok: false, issue: { code: "FLOATING_REFERENCE" } });
  });

  it("rejects duplicate exact meters and duplicate usage ids", () => {
    const meter = { meteringRef: { id: "metering.refund-invocations", versionRef: "1" }, unit: "count", window: "utc-month" };
    expect(parseViraCommercialMeterCatalog(catalog([meter, { ...meter }]))).toMatchObject({
      ok: false,
      issue: { code: "DUPLICATE_METER" },
    });

    expect(parseViraCommercialUsageBatch(usage([
      record({ usageId: "same", quantity: 1 }),
      record({ usageId: "same", quantity: 2 }),
    ]))).toMatchObject({ ok: false, issue: { code: "DUPLICATE_USAGE_ID" } });
  });

  it("rejects authority, pricing, payment and trust smuggling fields", () => {
    for (const injected of [
      { authorized: true },
      { allow: true },
      { price: 10 },
      { currency: "USD" },
      { unitPrice: 5 },
      { charge: 50 },
      { paymentProvider: "stripe" },
      { sourceAuthenticated: true },
    ]) {
      expect(parseViraCommercialUsageBatch(usage([record(injected)]))).toMatchObject({
        ok: false,
        issue: { code: "INVALID_USAGE_RECORD" },
      });
    }

    expect(rateViraCommercialUsage(catalog(), entitlementSet(), request({ authorized: true }))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_REQUEST" },
    });
  });

  it("fails closed on accessors and custom prototypes through shared JSON parsing", () => {
    const accessor = usage() as Record<string, unknown>;
    Object.defineProperty(accessor, "records", { enumerable: true, get: () => [record()] });
    expect(parseViraCommercialUsageBatch(accessor)).toMatchObject({ ok: false, issue: { code: "INVALID_INPUT" } });

    const polluted = Object.create({ admin: true });
    Object.assign(polluted, catalog());
    expect(parseViraCommercialMeterCatalog(polluted)).toMatchObject({ ok: false, issue: { code: "INVALID_INPUT" } });
  });

  it("rejects invalid timestamps and non-positive, fractional or unsafe quantities", () => {
    for (const occurredAt of ["2026-09-31T10:00:00Z", "2026-09-05T10:00:00+03:00", "not-a-date"]) {
      expect(parseViraCommercialUsageBatch(usage([record({ occurredAt })]))).toMatchObject({
        ok: false,
        issue: { code: "INVALID_TIMESTAMP" },
      });
    }

    for (const quantity of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(parseViraCommercialUsageBatch(usage([record({ quantity })]))).toMatchObject({
        ok: false,
        issue: { code: "INVALID_QUANTITY" },
      });
    }
  });

  it("fails closed when safe individual quantities overflow during aggregation", () => {
    const result = rateViraCommercialUsage(catalog(), entitlementSet(), request({
      usage: usage([
        record({ usageId: "max", quantity: Number.MAX_SAFE_INTEGER }),
        record({ usageId: "one", occurredAt: "2026-09-05T11:00:00Z", quantity: 1 }),
      ]),
    }));
    expect(result).toMatchObject({ ok: false, issue: { code: "QUANTITY_OVERFLOW" } });
  });

  it("rejects records from another Application, entitlement, meter, principal, Capability or location", () => {
    const variants = [
      { applicationVersion: "2.0.0" },
      { entitlementRef: { id: "entitlement.other", versionRef: "1" } },
      { meteringRef: { id: "metering.other", versionRef: "1" } },
      { principal: { version: "1", kind: "user", id: "user-2", organizationId: "contoso" } },
      { capabilityRef: null },
      { locationId: "us" },
    ];
    for (const variant of variants) {
      expect(rateViraCommercialUsage(catalog(), entitlementSet(), request({
        usage: usage([record(variant)]),
      }))).toMatchObject({ ok: false, issue: { code: "USAGE_SCOPE_MISMATCH" } });
    }
  });

  it("enforces meter and usage batch bounds", () => {
    const meters = Array.from({ length: VIRA_COMMERCIAL_METERING_MAX_METERS + 1 }, (_, index) => ({
      meteringRef: { id: `metering.metric-${index}`, versionRef: "1" },
      unit: "count",
      window: "lifetime",
    }));
    expect(parseViraCommercialMeterCatalog(catalog(meters))).toMatchObject({
      ok: false,
      issue: { code: "METER_LIMIT_EXCEEDED" },
    });

    const records = Array.from({ length: VIRA_COMMERCIAL_METERING_MAX_USAGE_RECORDS + 1 }, (_, index) => (
      record({ usageId: `usage-${index}` })
    ));
    expect(parseViraCommercialUsageBatch(usage(records))).toMatchObject({
      ok: false,
      issue: { code: "USAGE_LIMIT_EXCEEDED" },
    });
  });

  it("does not accept subscription-cycle or arbitrary monetary windows in the meter contract", () => {
    expect(parseViraCommercialMeterCatalog(catalog([
      { meteringRef: { id: "metering.refund-invocations", versionRef: "1" }, unit: "count", window: "billing-cycle" },
    ]))).toMatchObject({ ok: false, issue: { code: "INVALID_METER" } });
  });
});
