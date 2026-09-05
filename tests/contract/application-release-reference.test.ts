import { describe, expect, it } from "vitest";
import {
  parseViraApplicationPackage,
  parseViraApplicationReleaseReference,
  serializeViraApplicationReleaseReference,
} from "../../packages/application-package/src/index.js";
import {
  parseViraCommercialSettlementSchedule,
} from "../../packages/commercial-settlement/src/index.js";

function application(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "1",
    identity: { id: "vira.flight-assistant" },
    version: "1.2.0",
    publisher: { id: "vira", name: "Vira" },
    experiences: [{ id: "travel.flight.search", packId: "vira/flight-booking", packVersion: "2.1.0", entrypoint: "main" }],
    capabilities: [{ id: "travel.flight.search-capability", versionRef: "1" }],
    contextTypes: [{ id: "travel.flight.work-context", versionRef: "1" }],
    actions: [{ actionType: "travel.flight.book" }],
    flows: [{ id: "travel.flight.booking-flow", versionRef: "1" }],
    brandRef: { id: "brand.vira", versionRef: "1" },
    governanceRequirements: [{ id: "governance.booking-approval", versionRef: "1" }],
    hostCompatibility: { minViraVersion: "1.0.0", maxViraVersion: "2.0.0", requiredCapabilities: ["host.date-picker"] },
    protocolProjections: [{ id: "protocol.mcp-apps", versionRef: "1" }],
    distribution: { name: "Flight Assistant", tags: ["travel"], visibility: "organization", discoverable: true },
    commercial: {
      entitlementRefs: [{ id: "entitlement.flight-assistant", versionRef: "1" }],
      meteringRefs: [{ id: "metering.flight-assistant", versionRef: "1" }],
    },
    ...overrides,
  };
}

function schedule(applicationId = "vira.flight-assistant", applicationVersion = "1.2.0") {
  return {
    schemaVersion: "1",
    rules: [{
      settlementRef: { id: "settlement.vira-flight", versionRef: "1" },
      applicationId,
      applicationVersion,
      publisherId: "vira",
      planRef: { id: "plan.pro", versionRef: "1" },
      publisherShareBps: 7000,
    }],
  };
}

describe("Application release-reference canonical owner", () => {
  it("parses, freezes and deterministically serializes exact Application releases", () => {
    const input = { id: "vira.flight-assistant", version: "1.2.0" };
    const parsed = parseViraApplicationReleaseReference(input);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toEqual(input);
    expect(Object.isFrozen(parsed.value)).toBe(true);

    const serialized = serializeViraApplicationReleaseReference(input);
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) return;
    expect(serialized.value).toBe('{"id":"vira.flight-assistant","version":"1.2.0"}');
    expect(serialized.reference).toEqual(input);
  });

  it("keeps direct owner, Application package and settlement schedule release acceptance in parity", () => {
    for (const version of ["latest", "1", "1.2", "1.2.0-beta", "01.2.3", "1.02.3", "1.2.03"]) {
      expect(parseViraApplicationReleaseReference({ id: "vira.flight-assistant", version }).ok).toBe(false);
      expect(parseViraApplicationPackage({ ...application(), version }).ok).toBe(false);
      expect(parseViraCommercialSettlementSchedule(schedule("vira.flight-assistant", version)).ok).toBe(false);
    }

    for (const id of ["vira", "not valid", ".vira", "vira."]) {
      expect(parseViraApplicationReleaseReference({ id, version: "1.2.0" }).ok).toBe(false);
      expect(parseViraApplicationPackage({ ...application(), identity: { id } }).ok).toBe(false);
      expect(parseViraCommercialSettlementSchedule(schedule(id, "1.2.0")).ok).toBe(false);
    }
  });

  it("preserves owner-specific nested error paths in the Application package parser", () => {
    expect(parseViraApplicationPackage({ ...application(), identity: { id: "vira" } })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_IDENTITY", path: "$.identity.id" },
    });
    expect(parseViraApplicationPackage({ ...application(), version: "1.2" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_VERSION", path: "$.version" },
    });
  });

  it("fails closed on extra fields, accessors and custom prototypes", () => {
    expect(parseViraApplicationReleaseReference({
      id: "vira.flight-assistant",
      version: "1.2.0",
      latest: true,
    })).toMatchObject({ ok: false, issue: { code: "INVALID_IDENTITY" } });

    let getterCalls = 0;
    const malicious: Record<string, unknown> = { version: "1.2.0" };
    Object.defineProperty(malicious, "id", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "vira.flight-assistant";
      },
    });
    expect(parseViraApplicationReleaseReference(malicious).ok).toBe(false);
    expect(getterCalls).toBe(0);

    const custom = Object.assign(Object.create({ inherited: true }), {
      id: "vira.flight-assistant",
      version: "1.2.0",
    });
    expect(parseViraApplicationReleaseReference(custom).ok).toBe(false);
  });
});
