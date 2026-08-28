import { describe, expect, it } from "vitest";
import { composeExperience } from "../../packages/composer/src/index.js";
import { jsonRoundTrip } from "../helpers/index.js";

const capability = (id: string) => ({ version: "1", id });

function plan() {
  return {
    version: "1",
    id: "plan-1",
    intent: { version: "1", namespace: "travel.flight", name: "search" },
    state: { origin: "IST", destination: "BER" },
    capabilities: {
      required: [capability("select-date")],
      available: [capability("edit-passengers")],
      future: [capability("display.flight-results")],
    },
  };
}

const disclosure = {
  primary: "immediate",
  supporting: "progressive",
  deferred: "on-demand",
};

describe("composition engine", () => {
  it("composes planner priority, explicit layout, and one disclosure policy into semantic regions", () => {
    const result = composeExperience({ plan: plan(), layout: { family: "split" }, disclosure });
    expect(result).toMatchObject({
      ok: true,
      value: {
        planId: "plan-1",
        mode: "resolve",
        layout: { family: "split" },
        disclosure: { primary: "immediate", supporting: "progressive", deferred: "on-demand" },
        regions: [
          { id: "primary", role: "primary", capabilities: [{ id: "select-date" }] },
          { id: "supporting", role: "supporting", capabilities: [{ id: "edit-passengers" }] },
          { id: "deferred", role: "deferred", capabilities: [{ id: "display.flight-results" }] },
        ],
      },
    });
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.layout)).toBe(true);
    expect(Object.isFrozen(result.value.disclosure)).toBe(true);
    expect(Object.isFrozen(result.value.regions)).toBe(true);
    expect(Object.isFrozen(result.value.regions[0])).toBe(true);
    expect(jsonRoundTrip(result.value)).toEqual(result.value);
  });

  it("supports settled experiences with only deferred semantic regions while preserving disclosure truth", () => {
    const settledPlan = plan();
    settledPlan.capabilities.required = [];
    settledPlan.capabilities.available = [];
    const result = composeExperience({
      plan: settledPlan,
      layout: { family: "flow" },
      disclosure: { ...disclosure, deferred: "hidden" },
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        mode: "settled",
        disclosure: { deferred: "hidden" },
        regions: [{ id: "deferred", role: "deferred" }],
      },
    });
  });

  it("maps nested validation failures to public engine paths", () => {
    expect(composeExperience({ plan: { ...plan(), version: "2" }, layout: { family: "flow" }, disclosure })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_PLAN", path: "$.plan.version" },
    });
    expect(composeExperience({ plan: plan(), layout: { family: "flow", columns: 2 }, disclosure })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_LAYOUT_POLICY", path: "$.layout.columns" },
    });
    expect(composeExperience({ plan: plan(), layout: { family: "flow" }, disclosure: { ...disclosure, primary: "hidden" } })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_DISCLOSURE_POLICY", path: "$.disclosure.primary" },
    });
  });

  it("does not retain caller-owned policy or capability objects", () => {
    const inputPlan = plan();
    const inputDisclosure = { ...disclosure };
    const originalCapability = inputPlan.capabilities.required[0];
    const result = composeExperience({ plan: inputPlan, layout: { family: "single-focus" }, disclosure: inputDisclosure });
    expect(result.ok).toBe(true);
    if (!result.ok || !originalCapability) return;
    originalCapability.id = "mutated";
    inputDisclosure.supporting = "immediate";
    expect(result.value.regions[0]?.capabilities[0]?.id).toBe("select-date");
    expect(result.value.disclosure.supporting).toBe("progressive");
  });

  it("rejects unknown root fields and accessor-backed inputs without executing getters", () => {
    expect(composeExperience({ plan: plan(), layout: { family: "flow" }, disclosure, component: "Card" })).toMatchObject({
      ok: false,
      issue: { code: "UNKNOWN_FIELD", path: "$.component" },
    });

    let calls = 0;
    const input: Record<string, unknown> = { layout: { family: "flow" }, disclosure };
    Object.defineProperty(input, "plan", {
      enumerable: true,
      get() {
        calls += 1;
        return plan();
      },
    });
    expect(composeExperience(input)).toMatchObject({ ok: false, issue: { code: "INVALID_TYPE", path: "$.plan" } });
    expect(calls).toBe(0);
  });

  it("does not emit task state, component, DOM, CSS, action, endpoint, or geometry implementation fields", () => {
    const result = composeExperience({ plan: plan(), layout: { family: "split" }, disclosure });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const field of ["state", "domainData", "component", "components", "dom", "css", "actions", "endpoint", "columns", "gap", "breakpoint"]) {
      expect(Object.hasOwn(result.value, field)).toBe(false);
      for (const region of result.value.regions) expect(Object.hasOwn(region, field)).toBe(false);
    }
  });
});
