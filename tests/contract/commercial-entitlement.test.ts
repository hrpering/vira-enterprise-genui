import { describe, expect, it } from "vitest";
import {
  evaluateViraCommercialEntitlement,
  parseViraCommercialEntitlementSet,
  serializeViraCommercialEntitlementSet,
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
    protocolProjections: [{ id: "protocol.mcp-apps", versionRef: "1" }],
    distribution: {
      name: "Refund App",
      tags: ["refund"],
      visibility: "organization" as const,
      discoverable: true,
    },
    commercial: {
      entitlementRefs: [
        { id: "entitlement.refund-enterprise", versionRef: "1" },
        { id: "entitlement.refund-addon", versionRef: "1" },
      ],
      meteringRefs: [{ id: "metering.refund-invocations", versionRef: "1" }],
    },
  };
}

function entitlement(overrides: Record<string, unknown> = {}) {
  return {
    entitlementRef: { id: "entitlement.refund-enterprise", versionRef: "1" },
    subject: { organizationId: "contoso", principal: null },
    target: {
      applicationId: "demo.refund-app",
      applicationVersion: "1.0.0",
      capabilityRef: null,
    },
    scope: { projectId: null, environment: null, locationId: null },
    planRef: { id: "plan.enterprise", versionRef: "2026.1" },
    limits: [{
      meteringRef: { id: "metering.refund-invocations", versionRef: "1" },
      quantity: 500_000,
    }],
    commercialAccess: "enabled",
    ...overrides,
  };
}

function entitlementSet(entitlements = [entitlement()]) {
  return { schemaVersion: "1", entitlements };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    application: application(),
    entitlementRef: { id: "entitlement.refund-enterprise", versionRef: "1" },
    principal: { version: "1", kind: "user", id: "user-1", organizationId: "contoso" },
    scope: {
      version: "1",
      organizationId: "contoso",
      projectId: "refunds",
      environment: "production",
    },
    capabilityRef: { id: "refund.analysis", versionRef: "1" },
    locationId: "eu",
    ...overrides,
  };
}

describe("Vira Commercial Entitlement v1", () => {
  it("parses bounded commercial grants into deterministic frozen data", () => {
    const result = parseViraCommercialEntitlementSet(entitlementSet());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.entitlements)).toBe(true);
    expect(Object.isFrozen(result.value.entitlements[0])).toBe(true);
    expect(Object.isFrozen(result.value.entitlements[0]?.limits)).toBe(true);
    expect(Object.isFrozen(result.value.entitlements[0]?.limits[0])).toBe(true);
  });

  it("returns commercial entitlement evidence without producing authorization or execution authority", () => {
    const result = evaluateViraCommercialEntitlement(entitlementSet(), request());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.decision).toBe("entitled");
    expect(result.value.reason).toBe("MATCHED");
    expect(result.value.planRef).toEqual({ id: "plan.enterprise", versionRef: "2026.1" });
    expect(result.value.limits).toEqual([{
      meteringRef: { id: "metering.refund-invocations", versionRef: "1" },
      quantity: 500_000,
    }]);
    expect("authorized" in result.value).toBe(false);
    expect("allow" in result.value).toBe(false);
    expect("approved" in result.value).toBe(false);
    expect("execute" in result.value).toBe(false);
    expect("remainingQuota" in result.value).toBe(false);
    expect("used" in result.value).toBe(false);
  });

  it("treats disabled commercial access as not-entitled rather than a governance deny", () => {
    const result = evaluateViraCommercialEntitlement(
      entitlementSet([entitlement({ commercialAccess: "disabled" })]),
      request(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      decision: "not-entitled",
      reason: "COMMERCIAL_ACCESS_DISABLED",
    });
    expect("deny" in result.value).toBe(false);
  });

  it("returns not-entitled when no exact commercial selector matches", () => {
    const result = evaluateViraCommercialEntitlement(
      entitlementSet([entitlement({
        target: {
          applicationId: "demo.refund-app",
          applicationVersion: "2.0.0",
          capabilityRef: null,
        },
      })]),
      request(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      decision: "not-entitled",
      reason: "NO_MATCH",
      entitlementRef: { id: "entitlement.refund-enterprise", versionRef: "1" },
      matchedEntitlement: null,
      planRef: null,
      limits: [],
    });
  });

  it("evaluates exactly one entitlement ref selected from Application commercial metadata", () => {
    const addon = entitlement({
      entitlementRef: { id: "entitlement.refund-addon", versionRef: "1" },
      planRef: { id: "plan.addon", versionRef: "1" },
      limits: [],
    });
    const result = evaluateViraCommercialEntitlement(
      entitlementSet([addon]),
      request({ entitlementRef: { id: "entitlement.refund-addon", versionRef: "1" } }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.decision).toBe("entitled");
    expect(result.value.planRef).toEqual({ id: "plan.addon", versionRef: "1" });
  });

  it("rejects entitlement refs that the exact Application package does not declare", () => {
    const result = evaluateViraCommercialEntitlement(
      entitlementSet(),
      request({ entitlementRef: { id: "entitlement.undeclared", versionRef: "1" } }),
    );
    expect(result).toMatchObject({ ok: false, issue: { code: "UNDECLARED_ENTITLEMENT" } });
  });

  it("supports exact capability-scoped rights and rejects undeclared requested capabilities", () => {
    const capabilityGrant = entitlement({
      target: {
        applicationId: "demo.refund-app",
        applicationVersion: "1.0.0",
        capabilityRef: { id: "refund.analysis", versionRef: "1" },
      },
    });
    const exact = evaluateViraCommercialEntitlement(entitlementSet([capabilityGrant]), request());
    expect(exact.ok).toBe(true);
    if (exact.ok) expect(exact.value.decision).toBe("entitled");

    const undeclared = evaluateViraCommercialEntitlement(
      entitlementSet([capabilityGrant]),
      request({ capabilityRef: { id: "refund.execute", versionRef: "1" } }),
    );
    expect(undeclared).toMatchObject({ ok: false, issue: { code: "UNDECLARED_CAPABILITY" } });
  });

  it("uses exact enterprise organization/project/environment/location matching", () => {
    const scoped = entitlement({
      subject: { organizationId: "contoso", principal: { kind: "user", id: "user-1" } },
      scope: { projectId: "refunds", environment: "production", locationId: "eu" },
    });
    const exact = evaluateViraCommercialEntitlement(entitlementSet([scoped]), request());
    expect(exact.ok).toBe(true);
    if (exact.ok) expect(exact.value.decision).toBe("entitled");

    const otherLocation = evaluateViraCommercialEntitlement(
      entitlementSet([scoped]),
      request({ locationId: "us" }),
    );
    expect(otherLocation.ok).toBe(true);
    if (otherLocation.ok) expect(otherLocation.value).toMatchObject({ decision: "not-entitled", reason: "NO_MATCH" });
  });

  it("fails closed when broader and narrower grants overlap instead of inventing priority", () => {
    const broad = entitlement();
    const project = entitlement({
      scope: { projectId: "refunds", environment: null, locationId: null },
    });
    const result = evaluateViraCommercialEntitlement(entitlementSet([broad, project]), request());
    expect(result).toMatchObject({ ok: false, issue: { code: "AMBIGUOUS_ENTITLEMENT" } });
  });

  it("requires matched limit declarations to use Application-declared metering refs", () => {
    const result = evaluateViraCommercialEntitlement(
      entitlementSet([entitlement({
        limits: [{
          meteringRef: { id: "metering.undeclared", versionRef: "1" },
          quantity: 10,
        }],
      })]),
      request(),
    );
    expect(result).toMatchObject({ ok: false, issue: { code: "UNDECLARED_METERING" } });
  });

  it("serializes deterministically independent of entitlement input order", () => {
    const firstGrant = entitlement();
    const secondGrant = entitlement({
      subject: { organizationId: "fabrikam", principal: null },
    });
    const first = serializeViraCommercialEntitlementSet(entitlementSet([secondGrant, firstGrant]));
    const second = serializeViraCommercialEntitlementSet(entitlementSet([firstGrant, secondGrant]));
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) expect(first.value).toBe(second.value);
  });
});
