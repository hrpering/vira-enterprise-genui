import { describe, expect, it } from "vitest";
import {
  VIRA_CAPABILITY_SUPPLY_MAX_SOURCES,
  VIRA_CAPABILITY_SUPPLY_MAX_SUPPLIES_PER_SOURCE,
  lookupViraCapabilitySupply,
  parseViraCapabilitySupplySnapshot,
} from "../../packages/capability-supply/src/index.js";

function capability(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "1",
    id: "search.web",
    version: "1.0.0",
    publisher: { id: "search", name: "Search" },
    metadata: { name: "Web Search" },
    input: { typeRef: null },
    output: { typeRef: null },
    contextRequirements: [],
    invocation: { kind: "query" },
    ...overrides,
  };
}

function binding(overrides: Record<string, unknown> = {}) {
  return {
    version: "1",
    bindingRef: { id: "binding.search.acme", versionRef: "1" },
    capabilityRef: { id: "search.web", versionRef: "1.0.0" },
    providerId: "provider.acme",
    locationId: "region.eu",
    ...overrides,
  };
}

function supply(
  capabilityOverrides: Record<string, unknown> = {},
  bindingOverrides: Record<string, unknown> = {},
) {
  return { capability: capability(capabilityOverrides), binding: binding(bindingOverrides) };
}

function snapshot(sources: unknown[]) {
  return { schemaVersion: "1", sources };
}

function source(sourceId: string, supplies: unknown[]) {
  return { sourceId, supplies };
}

function query(overrides: Record<string, unknown> = {}) {
  return {
    capabilityId: "search.web",
    capabilityVersion: "1.0.0",
    providerId: null,
    locationId: null,
    ...overrides,
  };
}

describe("capability supply hardening", () => {
  it("fails closed when sources disagree on the same exact Capability semantics", () => {
    const result = parseViraCapabilitySupplySnapshot(snapshot([
      source("source.alpha", [supply({}, {
        bindingRef: { id: "binding.search.alpha", versionRef: "1" },
      })]),
      source("source.beta", [supply({
        metadata: { name: "Different Search Meaning" },
      }, {
        bindingRef: { id: "binding.search.beta", versionRef: "1" },
        providerId: "provider.beta",
      })]),
    ]));
    expect(result).toMatchObject({ ok: false, issue: { code: "CAPABILITY_CONFLICT" } });
  });

  it("fails closed when the same exact bindingRef resolves differently across sources", () => {
    const result = parseViraCapabilitySupplySnapshot(snapshot([
      source("source.alpha", [supply()]),
      source("source.beta", [supply({}, {
        providerId: "provider.other",
        locationId: "region.us",
      })]),
    ]));
    expect(result).toMatchObject({ ok: false, issue: { code: "BINDING_CONFLICT" } });
  });

  it("rejects duplicate source IDs and duplicate exact bindings inside one source", () => {
    expect(parseViraCapabilitySupplySnapshot(snapshot([
      source("source.alpha", []),
      source("source.alpha", []),
    ]))).toMatchObject({ ok: false, issue: { code: "DUPLICATE_SOURCE" } });

    expect(parseViraCapabilitySupplySnapshot(snapshot([
      source("source.alpha", [supply(), supply()]),
    ]))).toMatchObject({ ok: false, issue: { code: "DUPLICATE_SUPPLY" } });
  });

  it("delegates malformed Capability and binding validation to canonical owners", () => {
    expect(parseViraCapabilitySupplySnapshot(snapshot([
      source("source.alpha", [supply({
        publisher: { id: "other", name: "Other" },
      })]),
    ]))).toMatchObject({ ok: false, issue: { code: "INVALID_CAPABILITY" } });

    expect(parseViraCapabilitySupplySnapshot(snapshot([
      source("source.alpha", [supply({}, {
        bindingRef: { id: "binding.search.acme", versionRef: "latest" },
      })]),
    ]))).toMatchObject({ ok: false, issue: { code: "INVALID_BINDING" } });
  });

  it("rejects endpoint, credential, health, commercial and authority smuggling", () => {
    for (const field of ["endpoint", "credential", "healthy", "price", "authorized", "attested", "priority"]) {
      const record = { ...supply(), [field]: "smuggled" };
      expect(parseViraCapabilitySupplySnapshot(snapshot([
        source("source.alpha", [record]),
      ]))).toMatchObject({ ok: false, issue: { code: "UNKNOWN_FIELD" } });
    }

    expect(parseViraCapabilitySupplySnapshot(snapshot([
      source("source.alpha", [{
        capability: capability(),
        binding: { ...binding(), endpoint: "https://provider.invalid" },
      }]),
    ]))).toMatchObject({ ok: false, issue: { code: "INVALID_BINDING" } });
  });

  it("treats repeated sources only as provenance, never confidence or priority", () => {
    const result = lookupViraCapabilitySupply(snapshot([
      source("source.charlie", [supply()]),
      source("source.bravo", [supply()]),
      source("source.alpha", [supply()]),
    ]), query());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.supplies).toHaveLength(1);
    expect(result.value.supplies[0]!.sourceIds).toEqual(["source.alpha", "source.bravo", "source.charlie"]);
    expect("confidence" in result.value.supplies[0]!).toBe(false);
    expect("priority" in result.value.supplies[0]!).toBe(false);
    expect("trusted" in result.value.supplies[0]!).toBe(false);
    expect("authenticated" in result.value.supplies[0]!).toBe(false);
  });

  it("fails closed on accessors and custom prototypes without invoking getters", () => {
    let getterCalls = 0;
    const malicious: Record<string, unknown> = {};
    Object.defineProperty(malicious, "schemaVersion", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "1";
      },
    });
    malicious.sources = [source("source.alpha", [supply()])];
    expect(parseViraCapabilitySupplySnapshot(malicious).ok).toBe(false);
    expect(getterCalls).toBe(0);

    const custom = Object.assign(Object.create({ inherited: true }), query());
    expect(lookupViraCapabilitySupply(snapshot([source("source.alpha", [supply()])]), custom)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_QUERY" },
    });
  });

  it("enforces source and per-source collection ceilings", () => {
    const tooManySources = Array.from({ length: VIRA_CAPABILITY_SUPPLY_MAX_SOURCES + 1 }, (_, index) =>
      source(`source.s-${index}`, []));
    expect(parseViraCapabilitySupplySnapshot(snapshot(tooManySources))).toMatchObject({
      ok: false,
      issue: { code: "SOURCE_LIMIT_EXCEEDED" },
    });

    const tooManySupplies = Array.from({ length: VIRA_CAPABILITY_SUPPLY_MAX_SUPPLIES_PER_SOURCE + 1 }, (_, index) =>
      supply({}, {
        bindingRef: { id: `binding.search.b-${index}`, versionRef: "1" },
      }));
    expect(parseViraCapabilitySupplySnapshot(snapshot([
      source("source.alpha", tooManySupplies),
    ]))).toMatchObject({ ok: false, issue: { code: "SUPPLY_LIMIT_EXCEEDED" } });
  });

  it("rejects malformed exact queries and never accepts latest aliases", () => {
    const supplySnapshot = snapshot([source("source.alpha", [supply()])]);
    expect(lookupViraCapabilitySupply(supplySnapshot, query({ capabilityVersion: "latest" }))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_QUERY" },
    });
    expect(lookupViraCapabilitySupply(supplySnapshot, query({ providerId: "not valid" }))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_QUERY" },
    });
    expect(lookupViraCapabilitySupply(supplySnapshot, { ...query(), fallback: true })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_QUERY" },
    });
  });
});
