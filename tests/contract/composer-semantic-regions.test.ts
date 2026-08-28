import { describe, expect, it } from "vitest";
import { EXPERIENCE_PLAN_MAX_CAPABILITIES } from "../../packages/protocol/src/index.js";
import {
  SEMANTIC_REGION_MAX_REGIONS,
  createSemanticRegionSet,
} from "../../packages/composer/src/index.js";
import { jsonRoundTrip } from "../helpers/index.js";

const capability = (id: string) => ({ version: "1", id });

describe("composer semantic regions", () => {
  it("creates immutable semantic priority regions while preserving explicit order", () => {
    const result = createSemanticRegionSet({
      regions: [
        { id: "resolution", role: "primary", capabilities: [capability("select-date"), capability("resolve-origin")] },
        { id: "alternatives", role: "supporting", capabilities: [capability("edit-passengers")] },
        { id: "later", role: "deferred", capabilities: [capability("display.flight-results")] },
      ],
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        regions: [
          { id: "resolution", role: "primary", capabilities: [{ id: "select-date" }, { id: "resolve-origin" }] },
          { id: "alternatives", role: "supporting", capabilities: [{ id: "edit-passengers" }] },
          { id: "later", role: "deferred", capabilities: [{ id: "display.flight-results" }] },
        ],
      },
    });
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.regions)).toBe(true);
    expect(Object.isFrozen(result.value.regions[0])).toBe(true);
    expect(Object.isFrozen(result.value.regions[0]?.capabilities)).toBe(true);
    expect(jsonRoundTrip(result.value)).toEqual(result.value);
  });

  it("rejects presentation/execution fields and empty semantic regions", () => {
    for (const field of ["layout", "component", "props", "style", "action", "endpoint"]) {
      expect(createSemanticRegionSet({
        regions: [{ id: "main", role: "primary", capabilities: [capability("select-date")], [field]: "forbidden" }],
      })).toMatchObject({ ok: false, issue: { code: "INVALID_REGION", path: `$.regions[0].${field}` } });
    }
    expect(createSemanticRegionSet({ regions: [{ id: "main", role: "primary", capabilities: [] }] })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_CAPABILITIES" },
    });
  });

  it("rejects duplicate region ids and capability identities across regions", () => {
    expect(createSemanticRegionSet({
      regions: [
        { id: "main", role: "primary", capabilities: [capability("select-date")] },
        { id: "main", role: "supporting", capabilities: [capability("edit-passengers")] },
      ],
    })).toMatchObject({ ok: false, issue: { code: "DUPLICATE_REGION_ID" } });

    expect(createSemanticRegionSet({
      regions: [
        { id: "main", role: "primary", capabilities: [capability("select-date")] },
        { id: "aside", role: "supporting", capabilities: [capability("select-date")] },
      ],
    })).toMatchObject({ ok: false, issue: { code: "DUPLICATE_CAPABILITY" } });
  });

  it("rejects invalid roles and region identifiers", () => {
    expect(createSemanticRegionSet({ regions: [{ id: "Main", role: "primary", capabilities: [capability("select-date")] }] })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_REGION_ID" },
    });
    expect(createSemanticRegionSet({ regions: [{ id: "main", role: "sidebar", capabilities: [capability("select-date")] }] })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_REGION_ROLE" },
    });
  });

  it("bounds region and total capability counts before deep parsing", () => {
    const tooManyRegions = Array.from({ length: SEMANTIC_REGION_MAX_REGIONS + 1 }, (_, index) => ({
      id: `region-${index}`,
      role: "supporting",
      capabilities: [capability(`cap-${index}`)],
    }));
    expect(createSemanticRegionSet({ regions: tooManyRegions })).toMatchObject({
      ok: false,
      issue: { code: "REGION_LIMIT_EXCEEDED", path: "$.regions" },
    });

    const capabilities = Array.from({ length: EXPERIENCE_PLAN_MAX_CAPABILITIES + 1 }, (_, index) => capability(`cap-${index}`));
    expect(createSemanticRegionSet({ regions: [{ id: "main", role: "primary", capabilities }] })).toMatchObject({
      ok: false,
      issue: { code: "CAPABILITY_LIMIT_EXCEEDED", path: "$.regions" },
    });
  });

  it("does not invoke accessor-backed regions during resource preflight", () => {
    let calls = 0;
    const input: Record<string, unknown> = {};
    Object.defineProperty(input, "regions", {
      enumerable: true,
      get() {
        calls += 1;
        return [];
      },
    });
    expect(createSemanticRegionSet(input)).toMatchObject({ ok: false, issue: { code: "INVALID_TYPE", path: "$.regions" } });
    expect(calls).toBe(0);
  });
});
