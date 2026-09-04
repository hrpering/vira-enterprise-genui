import { describe, expect, it } from "vitest";
import {
  VIRA_COMMERCIAL_ENTITLEMENT_MAX_ENTITLEMENTS,
  VIRA_COMMERCIAL_ENTITLEMENT_MAX_LIMITS_PER_ENTITLEMENT,
  evaluateViraCommercialEntitlement,
  parseViraCommercialEntitlementSet,
} from "../../packages/commercial-entitlement/src/index.js";

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

function grant(overrides: Record<string, unknown> = {}) {
  return {
    entitlementRef: { id: "entitlement.refund-enterprise", versionRef: "1" },
    subject: { organizationId: "contoso", principal: null },
    target: { applicationId: "demo.refund-app", applicationVersion: "1.0.0", capabilityRef: null },
    scope: { projectId: null, environment: null, locationId: null },
    planRef: { id: "plan.enterprise", versionRef: "1" },
    limits: [],
    commercialAccess: "enabled",
    ...overrides,
  };
}

function set(entitlements = [grant()]) {
  return { schemaVersion: "1", entitlements };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    application: application(),
    entitlementRef: { id: "entitlement.refund-enterprise", versionRef: "1" },
    principal: { version: "1", kind: "user", id: "user-1", organizationId: "contoso" },
    scope: { version: "1", organizationId: "contoso", projectId: "refunds", environment: "production" },
    capabilityRef: null,
    locationId: null,
    ...overrides,
  };
}

describe("Vira Commercial Entitlement v1 hardening", () => {
  it("rejects floating entitlement, plan, capability and metering references", () => {
    expect(parseViraCommercialEntitlementSet(set([grant({
      entitlementRef: { id: "entitlement.refund-enterprise", versionRef: "latest" },
    })]))).toMatchObject({ ok: false, issue: { code: "FLOATING_REFERENCE" } });

    expect(parseViraCommercialEntitlementSet(set([grant({
      planRef: { id: "plan.enterprise", versionRef: "1.x" },
    })]))).toMatchObject({ ok: false, issue: { code: "FLOATING_REFERENCE" } });

    expect(parseViraCommercialEntitlementSet(set([grant({
      target: {
        applicationId: "demo.refund-app",
        applicationVersion: "1.0.0",
        capabilityRef: { id: "refund.analysis", versionRef: "current" },
      },
    })]))).toMatchObject({ ok: false, issue: { code: "FLOATING_REFERENCE" } });

    expect(parseViraCommercialEntitlementSet(set([grant({
      limits: [{ meteringRef: { id: "metering.refund-invocations", versionRef: "next" }, quantity: 1, period: "day" }],
    })]))).toMatchObject({ ok: false, issue: { code: "FLOATING_REFERENCE" } });
  });

  it("rejects authorization, execution, billing and mutable usage state smuggling", () => {
    for (const injected of [
      { authorized: true },
      { allow: true },
      { execute: true },
      { price: 99 },
      { currency: "USD" },
      { remainingQuota: 10 },
      { used: 2 },
      { paymentProvider: "stripe" },
    ]) {
      expect(parseViraCommercialEntitlementSet(set([grant(injected)]))).toMatchObject({
        ok: false,
        issue: { code: "UNKNOWN_FIELD" },
      });
    }
  });

  it("rejects unknown request authority fields instead of treating them as context", () => {
    const result = evaluateViraCommercialEntitlement(set(), request({ authorized: true }));
    expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_REQUEST" } });
  });

  it("fails closed on accessor and custom-prototype inputs through the shared JSON boundary", () => {
    const accessor = set() as Record<string, unknown>;
    Object.defineProperty(accessor, "entitlements", { enumerable: true, get: () => [grant()] });
    expect(parseViraCommercialEntitlementSet(accessor)).toMatchObject({ ok: false, issue: { code: "INVALID_INPUT" } });

    const polluted = Object.create({ admin: true });
    Object.assign(polluted, set());
    expect(parseViraCommercialEntitlementSet(polluted)).toMatchObject({ ok: false, issue: { code: "INVALID_INPUT" } });
  });

  it("rejects duplicate exact grant selectors rather than allowing order-dependent overrides", () => {
    const first = grant({ commercialAccess: "enabled" });
    const second = grant({ commercialAccess: "disabled" });
    expect(parseViraCommercialEntitlementSet(set([first, second]))).toMatchObject({
      ok: false,
      issue: { code: "DUPLICATE_ENTITLEMENT" },
    });
  });

  it("requires hierarchical scope validity and canonical enterprise request ownership", () => {
    expect(parseViraCommercialEntitlementSet(set([grant({
      scope: { projectId: null, environment: "production", locationId: null },
    })]))).toMatchObject({ ok: false, issue: { code: "INVALID_SCOPE" } });

    const crossOrganization = evaluateViraCommercialEntitlement(
      set(),
      request({
        principal: { version: "1", kind: "user", id: "user-1", organizationId: "fabrikam" },
      }),
    );
    expect(crossOrganization).toMatchObject({ ok: false, issue: { code: "INVALID_REQUEST" } });
  });

  it("enforces entitlement and per-entitlement limit bounds", () => {
    const tooManyEntitlements = Array.from(
      { length: VIRA_COMMERCIAL_ENTITLEMENT_MAX_ENTITLEMENTS + 1 },
      (_, index) => grant({ subject: { organizationId: `org-${index}`, principal: null } }),
    );
    expect(parseViraCommercialEntitlementSet(set(tooManyEntitlements))).toMatchObject({
      ok: false,
      issue: { code: "ENTITLEMENT_LIMIT_EXCEEDED" },
    });

    const tooManyLimits = Array.from(
      { length: VIRA_COMMERCIAL_ENTITLEMENT_MAX_LIMITS_PER_ENTITLEMENT + 1 },
      (_, index) => ({
        meteringRef: { id: `metering.metric-${index}`, versionRef: "1" },
        quantity: 1,
        period: "day",
      }),
    );
    expect(parseViraCommercialEntitlementSet(set([grant({ limits: tooManyLimits })]))).toMatchObject({
      ok: false,
      issue: { code: "LIMIT_EXCEEDED" },
    });
  });

  it("rejects unsafe or duplicate quota declarations", () => {
    expect(parseViraCommercialEntitlementSet(set([grant({
      limits: [{
        meteringRef: { id: "metering.refund-invocations", versionRef: "1" },
        quantity: Number.MAX_SAFE_INTEGER + 1,
        period: "month",
      }],
    })]))).toMatchObject({ ok: false, issue: { code: "INVALID_LIMIT" } });

    expect(parseViraCommercialEntitlementSet(set([grant({
      limits: [
        { meteringRef: { id: "metering.refund-invocations", versionRef: "1" }, quantity: 10, period: "month" },
        { meteringRef: { id: "metering.refund-invocations", versionRef: "1" }, quantity: 20, period: "month" },
      ],
    })]))).toMatchObject({ ok: false, issue: { code: "INVALID_LIMIT" } });
  });

  it("rejects floating request references before commercial matching", () => {
    const result = evaluateViraCommercialEntitlement(
      set(),
      request({ entitlementRef: { id: "entitlement.refund-enterprise", versionRef: "latest" } }),
    );
    expect(result).toMatchObject({ ok: false, issue: { code: "FLOATING_REFERENCE" } });
  });
});
