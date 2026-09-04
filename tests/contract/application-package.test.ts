import { describe, expect, it } from "vitest";
import {
  parseViraApplicationPackage,
  serializeViraApplicationPackage,
} from "../../packages/application-package/src/index.js";

function fixture() {
  return {
    schemaVersion: "1",
    identity: { id: "vira.flight-assistant" },
    version: "1.2.0",
    publisher: { id: "vira", name: "Vira" },
    experiences: [{
      id: "travel.flight.search",
      packId: "vira/flight-booking",
      packVersion: "2.1.0",
      entrypoint: "main",
    }],
    capabilities: [{ id: "travel.flight.search-capability", versionRef: "1" }],
    contextTypes: [{ id: "travel.flight.work-context", versionRef: "1" }],
    actions: [{ actionType: "travel.flight.book" }],
    flows: [{ id: "travel.flight.booking-flow", versionRef: "1" }],
    brandRef: { id: "brand.vira", versionRef: "1" },
    governanceRequirements: [{ id: "governance.booking-approval", versionRef: "1" }],
    hostCompatibility: {
      minViraVersion: "1.0.0",
      maxViraVersion: "2.0.0",
      requiredCapabilities: ["host.date-picker"],
    },
    protocolProjections: [{ id: "protocol.mcp-apps", versionRef: "1" }],
    distribution: {
      name: "Flight Assistant",
      description: "A governed flight application.",
      tags: ["travel", "booking"],
      visibility: "organization",
      discoverable: true,
    },
    commercial: {
      entitlementRefs: [{ id: "entitlement.flight-assistant", versionRef: "1" }],
      meteringRefs: [{ id: "metering.flight-assistant", versionRef: "1" }],
    },
  };
}

describe("Vira Application Package v1", () => {
  it("parses a reference-only package into detached deeply frozen data", () => {
    const input = fixture();
    const result = parseViraApplicationPackage(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).not.toBe(input);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.experiences)).toBe(true);
    expect(Object.isFrozen(result.value.experiences[0])).toBe(true);
    expect(Object.isFrozen(result.value.commercial.entitlementRefs[0])).toBe(true);
  });

  it("rejects inline payloads and secret/provider additions fail-closed", () => {
    expect(parseViraApplicationPackage({ ...fixture(), apiKey: "secret" })).toMatchObject({
      ok: false,
      issue: { code: "UNKNOWN_FIELD", path: "$.apiKey" },
    });
    const input = fixture();
    input.experiences[0] = { ...input.experiences[0], document: { views: [] } } as typeof input.experiences[number];
    expect(parseViraApplicationPackage(input)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_EXPERIENCE", path: "$.experiences[0].document" },
    });
  });

  it("requires publisher namespace parity and immutable release semver", () => {
    expect(parseViraApplicationPackage({ ...fixture(), publisher: { id: "other", name: "Other" } })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_PUBLISHER", path: "$.publisher.id" },
    });
    expect(parseViraApplicationPackage({ ...fixture(), version: "latest" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_VERSION", path: "$.version" },
    });
  });

  it("rejects floating dependency references", () => {
    const latest = fixture();
    latest.capabilities[0] = { ...latest.capabilities[0]!, versionRef: "latest" };
    expect(parseViraApplicationPackage(latest)).toMatchObject({
      ok: false,
      issue: { code: "FLOATING_REFERENCE", path: "$.capabilities[0].versionRef" },
    });

    const wildcard = fixture();
    wildcard.flows[0] = { ...wildcard.flows[0]!, versionRef: "1.x" };
    expect(parseViraApplicationPackage(wildcard)).toMatchObject({
      ok: false,
      issue: { code: "FLOATING_REFERENCE", path: "$.flows[0].versionRef" },
    });
  });

  it("requires exact Experience Pack release references", () => {
    const input = fixture();
    input.experiences[0] = { ...input.experiences[0]!, packVersion: "2.x" };
    expect(parseViraApplicationPackage(input)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_EXPERIENCE", path: "$.experiences[0].packVersion" },
    });
  });

  it("rejects duplicate semantic references and actions", () => {
    const refs = fixture();
    refs.capabilities.push({ ...refs.capabilities[0]! });
    expect(parseViraApplicationPackage(refs)).toMatchObject({
      ok: false,
      issue: { code: "DUPLICATE_REFERENCE", path: "$.capabilities[1]" },
    });

    const actions = fixture();
    actions.actions.push({ ...actions.actions[0]! });
    expect(parseViraApplicationPackage(actions)).toMatchObject({
      ok: false,
      issue: { code: "DUPLICATE_ACTION", path: "$.actions[1]" },
    });
  });

  it("rejects semantically empty Applications", () => {
    const input = fixture();
    input.experiences = [];
    input.capabilities = [];
    input.actions = [];
    input.flows = [];
    expect(parseViraApplicationPackage(input)).toMatchObject({
      ok: false,
      issue: { code: "EMPTY_APPLICATION", path: "$" },
    });
  });

  it("keeps commercial metadata distinct from authorization payloads", () => {
    const input = fixture();
    input.commercial = {
      ...input.commercial,
      authorizedActions: ["travel.flight.book"],
    } as typeof input.commercial;
    expect(parseViraApplicationPackage(input)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_COMMERCIAL", path: "$.commercial.authorizedActions" },
    });
  });

  it("rejects unsafe accessor/prototype input through the shared JSON boundary", () => {
    const input = fixture() as Record<string, unknown>;
    Object.defineProperty(input, "publisher", { enumerable: true, get: () => ({ id: "vira", name: "Vira" }) });
    expect(parseViraApplicationPackage(input)).toMatchObject({ ok: false, issue: { code: "INVALID_TYPE" } });

    const polluted = Object.create({ admin: true });
    Object.assign(polluted, fixture());
    expect(parseViraApplicationPackage(polluted)).toMatchObject({ ok: false, issue: { code: "INVALID_TYPE" } });
  });

  it("serializes deterministically regardless of input key order", () => {
    const original = fixture();
    const reordered = {
      commercial: original.commercial,
      distribution: original.distribution,
      protocolProjections: original.protocolProjections,
      hostCompatibility: original.hostCompatibility,
      governanceRequirements: original.governanceRequirements,
      brandRef: original.brandRef,
      flows: original.flows,
      actions: original.actions,
      contextTypes: original.contextTypes,
      capabilities: original.capabilities,
      experiences: original.experiences,
      publisher: { name: original.publisher.name, id: original.publisher.id },
      version: original.version,
      identity: original.identity,
      schemaVersion: original.schemaVersion,
    };
    const first = serializeViraApplicationPackage(original);
    const second = serializeViraApplicationPackage(reordered);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value).toBe(second.value);
  });
});
