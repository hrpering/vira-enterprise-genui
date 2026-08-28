import { describe, expect, it } from "vitest";
import { planComposition } from "../../packages/planner/src/index.js";
import { jsonRoundTrip } from "../helpers/index.js";

const capability = (id: string) => ({ version: "1", id });

function plan(capabilities: Record<string, unknown>) {
  return {
    version: "1",
    id: "plan-1",
    intent: { version: "1", namespace: "travel.flight", name: "search" },
    state: {},
    capabilities,
  };
}

describe("composition planner", () => {
  it("prioritizes all required capabilities before available capabilities", () => {
    const result = planComposition(plan({
      required: [capability("select-date"), capability("resolve-origin")],
      available: [capability("edit-passengers")],
      future: [capability("display.flight-results")],
    }));
    expect(result).toMatchObject({
      ok: true,
      value: {
        mode: "resolve",
        primary: [{ id: "select-date" }, { id: "resolve-origin" }],
        supporting: [{ id: "edit-passengers" }],
        deferred: [{ id: "display.flight-results" }],
      },
    });
  });

  it("uses the first explicitly ordered available capability as primary when no blocker exists", () => {
    const result = planComposition(plan({
      required: [],
      available: [capability("search.submit"), capability("edit-passengers")],
      future: [],
    }));
    expect(result).toMatchObject({
      ok: true,
      value: {
        mode: "interact",
        primary: [{ id: "search.submit" }],
        supporting: [{ id: "edit-passengers" }],
      },
    });
  });

  it("produces settled mode when there is no current interaction capability", () => {
    const result = planComposition(plan({
      required: [],
      available: [],
      future: [capability("display.receipt")],
    }));
    expect(result).toMatchObject({
      ok: true,
      value: {
        mode: "settled",
        primary: [],
        supporting: [],
        deferred: [{ id: "display.receipt" }],
      },
    });
  });

  it("returns recursively frozen serializable semantic data", () => {
    const result = planComposition(plan({ required: [], available: [capability("search.submit")], future: [] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.primary)).toBe(true);
    expect(Object.isFrozen(result.value.primary[0])).toBe(true);
    expect(jsonRoundTrip(result.value)).toEqual(result.value);
  });

  it("rejects invalid ExperiencePlan input through Protocol", () => {
    expect(planComposition(plan({ required: [capability("x")], available: [capability("x")], future: [] }))).toMatchObject({
      ok: false,
      issue: { code: "INVALID_PLAN" },
    });
  });

  it("does not produce regions, layout, component, action, or styling ownership", () => {
    const result = planComposition(plan({ required: [], available: [capability("search.submit")], future: [] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const field of ["regions", "layout", "component", "actions", "style", "disclosure"]) {
      expect(Object.hasOwn(result.value, field)).toBe(false);
    }
  });
});
