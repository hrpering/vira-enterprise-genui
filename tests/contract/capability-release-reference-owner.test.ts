import { describe, expect, it } from "vitest";
import {
  parseViraCapabilityDefinition,
  parseViraCapabilityReleaseReference,
  serializeViraCapabilityReleaseReference,
} from "../../packages/capability-contract/src/index.js";
import { lookupViraCapabilitySupply } from "../../packages/capability-supply/src/index.js";

function definition(version = "1.0.0") {
  return {
    schemaVersion: "1",
    id: "acme.search",
    version,
    publisher: { id: "acme", name: "Acme" },
    metadata: { name: "Search" },
    input: { typeRef: null },
    output: { typeRef: null },
    contextRequirements: [],
    invocation: { kind: "query" as const },
  };
}

const emptySupply = Object.freeze({ schemaVersion: "1", sources: Object.freeze([]) });

describe("canonical Capability release-reference owner", () => {
  it("parses and serializes one deterministic exact Capability release reference", () => {
    const parsed = parseViraCapabilityReleaseReference({ id: "acme.search", version: "1.2.3" });
    expect(parsed).toEqual({ ok: true, value: { id: "acme.search", version: "1.2.3" } });

    const serialized = serializeViraCapabilityReleaseReference(parsed.ok ? parsed.value : null);
    expect(serialized).toMatchObject({
      ok: true,
      value: '{"id":"acme.search","version":"1.2.3"}',
      reference: { id: "acme.search", version: "1.2.3" },
    });
  });

  it("keeps CapabilityDefinition release validation on the same canonical owner semantics", () => {
    expect(parseViraCapabilityReleaseReference({ id: "acme.search", version: "1" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_VERSION", path: "$.version" },
    });
    expect(parseViraCapabilityDefinition(definition("1"))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_VERSION", path: "$.version" },
    });
  });

  it("maps Capability supply query release errors from the canonical owner without a local semver parser", () => {
    expect(lookupViraCapabilitySupply(emptySupply, {
      capabilityId: "acme.search",
      capabilityVersion: "1",
      providerId: null,
      locationId: null,
    })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_QUERY", path: "$query.capabilityVersion" },
    });

    expect(lookupViraCapabilitySupply(emptySupply, {
      capabilityId: "search",
      capabilityVersion: "1.0.0",
      providerId: null,
      locationId: null,
    })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_QUERY", path: "$query.capabilityId" },
    });
  });

  it("fails closed on accessor-backed release references without invoking getters", () => {
    let getterCalls = 0;
    const input: Record<string, unknown> = { id: "acme.search" };
    Object.defineProperty(input, "version", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "1.0.0";
      },
    });

    expect(parseViraCapabilityReleaseReference(input)).toMatchObject({ ok: false });
    expect(getterCalls).toBe(0);
  });
});
