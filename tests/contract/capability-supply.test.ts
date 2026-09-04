import { describe, expect, it } from "vitest";
import {
  lookupViraCapabilitySupply,
  parseViraCapabilitySupplySnapshot,
  serializeViraCapabilitySupplySnapshot,
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
  return {
    capability: capability(capabilityOverrides),
    binding: binding(bindingOverrides),
  };
}

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "1",
    sources: [
      {
        sourceId: "source.alpha",
        supplies: [supply()],
      },
    ],
    ...overrides,
  };
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

describe("capability supply", () => {
  it("parses immutable deterministic snapshots", () => {
    const parsed = parseViraCapabilitySupplySnapshot(snapshot({
      sources: [
        {
          sourceId: "source.zeta",
          supplies: [
            supply({}, {
              bindingRef: { id: "binding.search.zeta", versionRef: "1" },
              providerId: "provider.zeta",
            }),
            supply({}, {
              bindingRef: { id: "binding.search.alpha", versionRef: "1" },
              providerId: "provider.alpha",
            }),
          ],
        },
        {
          sourceId: "source.alpha",
          supplies: [supply()],
        },
      ],
    }));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.sources.map((source) => source.sourceId)).toEqual(["source.alpha", "source.zeta"]);
    expect(parsed.value.sources[1]!.supplies.map((entry) => entry.binding.providerId)).toEqual([
      "provider.alpha",
      "provider.zeta",
    ]);
    expect(Object.isFrozen(parsed.value)).toBe(true);
    expect(Object.isFrozen(parsed.value.sources)).toBe(true);
    expect(Object.isFrozen(parsed.value.sources[0]!.supplies)).toBe(true);
    expect(Object.isFrozen(parsed.value.sources[0]!.supplies[0]!.capability)).toBe(true);
    expect(Object.isFrozen(parsed.value.sources[0]!.supplies[0]!.binding)).toBe(true);
  });

  it("serializes snapshots deterministically", () => {
    const unsorted = snapshot({
      sources: [
        { sourceId: "source.zeta", supplies: [supply({}, { providerId: "provider.zeta" })] },
        { sourceId: "source.alpha", supplies: [supply({}, { providerId: "provider.alpha", bindingRef: { id: "binding.search.alpha", versionRef: "1" } })] },
      ],
    });
    const first = serializeViraCapabilitySupplySnapshot(unsorted);
    const second = serializeViraCapabilitySupplySnapshot(JSON.parse(first.ok ? first.value : "null"));
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value).toBe(first.value);
    expect(first.snapshot.sources.map((source) => source.sourceId)).toEqual(["source.alpha", "source.zeta"]);
  });

  it("aggregates identical binding provenance across sources", () => {
    const result = lookupViraCapabilitySupply(snapshot({
      sources: [
        { sourceId: "source.beta", supplies: [supply()] },
        { sourceId: "source.alpha", supplies: [supply()] },
      ],
    }), query());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.supplies).toHaveLength(1);
    expect(result.value.supplies[0]!.sourceIds).toEqual(["source.alpha", "source.beta"]);
    expect(result.value.supplies[0]!.binding).toMatchObject({
      providerId: "provider.acme",
      locationId: "region.eu",
    });
  });

  it("returns all matching bindings without ranking", () => {
    const result = lookupViraCapabilitySupply(snapshot({
      sources: [{
        sourceId: "source.alpha",
        supplies: [
          supply({}, {
            bindingRef: { id: "binding.search.zeta", versionRef: "1" },
            providerId: "provider.zeta",
            locationId: "region.us",
          }),
          supply({}, {
            bindingRef: { id: "binding.search.alpha", versionRef: "1" },
            providerId: "provider.alpha",
            locationId: "region.eu",
          }),
        ],
      }],
    }), query());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.supplies.map((entry) => entry.binding.providerId)).toEqual([
      "provider.alpha",
      "provider.zeta",
    ]);
    expect("preferred" in result.value).toBe(false);
    expect("selected" in result.value).toBe(false);
    expect("fallback" in result.value).toBe(false);
  });

  it("applies provider and location filters deterministically", () => {
    const supplySnapshot = snapshot({
      sources: [{
        sourceId: "source.alpha",
        supplies: [
          supply({}, {
            bindingRef: { id: "binding.search.eu", versionRef: "1" },
            providerId: "provider.acme",
            locationId: "region.eu",
          }),
          supply({}, {
            bindingRef: { id: "binding.search.us", versionRef: "1" },
            providerId: "provider.acme",
            locationId: "region.us",
          }),
          supply({}, {
            bindingRef: { id: "binding.search.other", versionRef: "1" },
            providerId: "provider.other",
            locationId: "region.eu",
          }),
        ],
      }],
    });

    const provider = lookupViraCapabilitySupply(supplySnapshot, query({ providerId: "provider.acme" }));
    expect(provider.ok).toBe(true);
    if (provider.ok) expect(provider.value.supplies).toHaveLength(2);

    const location = lookupViraCapabilitySupply(supplySnapshot, query({ locationId: "region.eu" }));
    expect(location.ok).toBe(true);
    if (location.ok) expect(location.value.supplies).toHaveLength(2);

    const both = lookupViraCapabilitySupply(supplySnapshot, query({
      providerId: "provider.acme",
      locationId: "region.eu",
    }));
    expect(both.ok).toBe(true);
    if (both.ok) expect(both.value.supplies.map((entry) => entry.binding.bindingRef.id)).toEqual(["binding.search.eu"]);
  });

  it("returns an empty exact result rather than falling back", () => {
    const result = lookupViraCapabilitySupply(snapshot(), query({ capabilityVersion: "2.0.0" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.capabilityVersion).toBe("2.0.0");
    expect(result.value.supplies).toEqual([]);
  });

  it("rejects action Capabilities from hosted supply", () => {
    expect(parseViraCapabilitySupplySnapshot(snapshot({
      sources: [{
        sourceId: "source.alpha",
        supplies: [supply({ invocation: { kind: "action", actionType: "payments.refund" } })],
      }],
    }))).toMatchObject({ ok: false, issue: { code: "ACTION_BOUNDARY_REQUIRED" } });
  });

  it("rejects binding and Capability identity mismatch", () => {
    expect(parseViraCapabilitySupplySnapshot(snapshot({
      sources: [{
        sourceId: "source.alpha",
        supplies: [supply({}, {
          capabilityRef: { id: "search.other", versionRef: "1.0.0" },
        })],
      }],
    }))).toMatchObject({ ok: false, issue: { code: "CAPABILITY_MISMATCH" } });
  });
});
