import { describe, expect, it } from "vitest";
import {
  EXPERIENCE_PLAN_MAX_CAPABILITIES,
} from "../../packages/protocol/src/index.js";
import {
  CAPABILITY_RESOLVER_MAX_ENTRIES,
  resolveCapabilities,
} from "../../packages/planner/src/index.js";
import { jsonRoundTrip } from "../helpers/index.js";

const capability = (id: string) => ({ version: "1", id });

describe("planner capability resolver", () => {
  it("maps missing/conflicting blockers to explicit required capabilities and preserves static buckets", () => {
    const result = resolveCapabilities({
      missing: ["departure-date"],
      conflicts: ["origin"],
      requirements: [
        { field: "origin", capability: capability("resolve-origin") },
        { field: "departure-date", capability: capability("select-date") },
      ],
      available: [capability("edit-passengers")],
      future: [capability("display.flight-results")],
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        required: [{ id: "resolve-origin" }, { id: "select-date" }],
        available: [{ id: "edit-passengers" }],
        future: [{ id: "display.flight-results" }],
      },
    });
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.required)).toBe(true);
    expect(jsonRoundTrip(result.value)).toEqual(result.value);
  });

  it("fails closed when a blocker has no explicit capability mapping", () => {
    expect(resolveCapabilities({
      missing: ["departure-date"],
      conflicts: [],
      requirements: [],
    })).toMatchObject({ ok: false, issue: { code: "UNMAPPED_BLOCKER", path: "$.requirements" } });
  });

  it("rejects ambiguous blockers and duplicate requirement mappings", () => {
    expect(resolveCapabilities({
      missing: ["origin"],
      conflicts: ["origin"],
      requirements: [{ field: "origin", capability: capability("resolve-origin") }],
    })).toMatchObject({ ok: false, issue: { code: "AMBIGUOUS_BLOCKER" } });

    expect(resolveCapabilities({
      missing: ["origin"],
      conflicts: [],
      requirements: [
        { field: "origin", capability: capability("resolve-origin") },
        { field: "origin", capability: capability("select-origin") },
      ],
    })).toMatchObject({ ok: false, issue: { code: "DUPLICATE_REQUIREMENT" } });
  });

  it("rejects duplicate capability identities across semantic buckets/config", () => {
    expect(resolveCapabilities({
      missing: ["origin"],
      conflicts: [],
      requirements: [{ field: "origin", capability: capability("select-location") }],
      available: [capability("select-location")],
    })).toMatchObject({ ok: false, issue: { code: "DUPLICATE_CAPABILITY" } });
  });

  it("does not invent capabilities when there are no blockers", () => {
    const result = resolveCapabilities({
      missing: [],
      conflicts: [],
      requirements: [{ field: "departure-date", capability: capability("select-date") }],
      available: [],
      future: [],
    });
    expect(result).toMatchObject({ ok: true, value: { required: [], available: [], future: [] } });
  });

  it("cannot emit more capabilities than ExperiencePlan accepts", () => {
    const available = Array.from({ length: EXPERIENCE_PLAN_MAX_CAPABILITIES }, (_, index) => capability(`available-${index}`));
    expect(resolveCapabilities({
      missing: ["origin"],
      conflicts: [],
      requirements: [{ field: "origin", capability: capability("resolve-origin") }],
      available,
    })).toMatchObject({ ok: false, issue: { code: "OUTPUT_LIMIT_EXCEEDED" } });
  });

  it("enforces array bounds before recursive canonical parsing", () => {
    const missing = Array.from({ length: CAPABILITY_RESOLVER_MAX_ENTRIES + 1 }, () => "origin");
    expect(resolveCapabilities({ missing, conflicts: [], requirements: [] })).toMatchObject({
      ok: false,
      issue: { code: "ENTRY_LIMIT_EXCEEDED", path: "$.missing" },
    });
  });

  it("rejects accessor input without invoking getters", () => {
    let calls = 0;
    const input: Record<string, unknown> = { missing: [], conflicts: [], requirements: [] };
    Object.defineProperty(input, "available", {
      enumerable: true,
      get() {
        calls += 1;
        return [];
      },
    });
    expect(resolveCapabilities(input)).toMatchObject({ ok: false, issue: { code: "INVALID_TYPE", path: "$.available" } });
    expect(calls).toBe(0);
  });
});
