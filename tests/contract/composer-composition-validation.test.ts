import { describe, expect, it } from "vitest";
import {
  COMPOSITION_PRIORITY_MODES,
  isCompositionPriorityMode,
} from "../../packages/planner/src/index.js";
import { isExperiencePlanId } from "../../packages/protocol/src/index.js";
import {
  composeExperience,
  parseComposedExperience,
  validateComposedExperienceAgainstPlan,
} from "../../packages/composer/src/index.js";
import { jsonRoundTrip } from "../helpers/index.js";

const capability = (id: string) => ({ version: "1", id });
const disclosure = { primary: "immediate", supporting: "progressive", deferred: "on-demand" };

function sourcePlan() {
  return {
    version: "1",
    id: "plan-1",
    intent: { version: "1", namespace: "travel.flight", name: "search" },
    state: {},
    capabilities: {
      required: [capability("select-date")],
      available: [capability("edit-passengers")],
      future: [capability("display.flight-results")],
    },
  };
}

function engineResult() {
  return composeExperience({ plan: sourcePlan(), layout: { family: "split" }, disclosure });
}

describe("composed experience validation", () => {
  it("parses Composition Engine output into an equal frozen canonical artifact", () => {
    const engine = engineResult();
    expect(engine.ok).toBe(true);
    if (!engine.ok) return;
    const parsed = parseComposedExperience(engine.value);
    expect(parsed).toMatchObject({ ok: true });
    if (!parsed.ok) return;
    expect(parsed.value).toEqual(engine.value);
    expect(parsed.value).not.toBe(engine.value);
    expect(Object.isFrozen(parsed.value)).toBe(true);
    expect(Object.isFrozen(parsed.value.regions)).toBe(true);
    expect(jsonRoundTrip(parsed.value)).toEqual(parsed.value);
  });

  it("validates engine output against its source ExperiencePlan", () => {
    const engine = engineResult();
    expect(engine.ok).toBe(true);
    if (!engine.ok) return;
    const validated = validateComposedExperienceAgainstPlan(engine.value, sourcePlan());
    expect(validated).toMatchObject({ ok: true });
    if (!validated.ok) return;
    expect(validated.value).toEqual(engine.value);
  });

  it("reuses owner package identity/mode validators instead of duplicate truth", () => {
    expect(isExperiencePlanId("plan-1")).toBe(true);
    expect(isExperiencePlanId("bad id")).toBe(false);
    expect(Object.isFrozen(COMPOSITION_PRIORITY_MODES)).toBe(true);
    for (const mode of COMPOSITION_PRIORITY_MODES) expect(isCompositionPriorityMode(mode)).toBe(true);
    expect(isCompositionPriorityMode("auto")).toBe(false);
  });

  it("rejects forged plan IDs and modes", () => {
    const engine = engineResult();
    expect(engine.ok).toBe(true);
    if (!engine.ok) return;
    expect(parseComposedExperience({ ...engine.value, planId: "bad id" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_PLAN_ID", path: "$.planId" },
    });
    expect(parseComposedExperience({ ...engine.value, mode: "auto" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_MODE", path: "$.mode" },
    });
  });

  it("rejects shape-valid artifacts that drift from the source plan", () => {
    const engine = engineResult();
    expect(engine.ok).toBe(true);
    if (!engine.ok) return;

    expect(validateComposedExperienceAgainstPlan({ ...engine.value, planId: "plan-2" }, sourcePlan())).toMatchObject({
      ok: false,
      issue: { code: "PLAN_ID_MISMATCH", path: "$.planId" },
    });

    const alteredMode = { ...engine.value, mode: "interact" };
    expect(validateComposedExperienceAgainstPlan(alteredMode, sourcePlan())).toMatchObject({
      ok: false,
      issue: { code: "MODE_MISMATCH", path: "$.mode" },
    });

    const injected = {
      ...engine.value,
      regions: [
        ...engine.value.regions.slice(0, 1),
        { id: "injected", role: "supporting", capabilities: [capability("admin.delete")] },
        ...engine.value.regions.slice(2),
      ],
    };
    expect(parseComposedExperience(injected)).toMatchObject({ ok: true });
    expect(validateComposedExperienceAgainstPlan(injected, sourcePlan())).toMatchObject({
      ok: false,
      issue: { code: "CAPABILITY_MISMATCH", path: "$.regions" },
    });
  });

  it("enforces mode/region consistency", () => {
    const primaryRegion = { id: "main", role: "primary", capabilities: [capability("select-date")] };
    const supportingRegion = { id: "support", role: "supporting", capabilities: [capability("edit-passengers")] };
    const deferredRegion = { id: "later", role: "deferred", capabilities: [capability("display.results")] };

    expect(parseComposedExperience({
      planId: "plan-1",
      mode: "resolve",
      layout: { family: "flow" },
      disclosure,
      regions: [deferredRegion],
    })).toMatchObject({ ok: false, issue: { code: "INVALID_MODE_REGION_COMBINATION" } });

    expect(parseComposedExperience({
      planId: "plan-1",
      mode: "interact",
      layout: { family: "flow" },
      disclosure,
      regions: [supportingRegion],
    })).toMatchObject({ ok: false, issue: { code: "INVALID_MODE_REGION_COMBINATION" } });

    expect(parseComposedExperience({
      planId: "plan-1",
      mode: "settled",
      layout: { family: "flow" },
      disclosure,
      regions: [primaryRegion, deferredRegion],
    })).toMatchObject({ ok: false, issue: { code: "INVALID_MODE_REGION_COMBINATION" } });
  });

  it("delegates nested policy/region validation to owning Composer contracts", () => {
    expect(parseComposedExperience({
      planId: "plan-1",
      mode: "settled",
      layout: { family: "flow", columns: 2 },
      disclosure,
      regions: [],
    })).toMatchObject({ ok: false, issue: { code: "INVALID_LAYOUT_POLICY", path: "$.layout.columns" } });

    expect(parseComposedExperience({
      planId: "plan-1",
      mode: "settled",
      layout: { family: "flow" },
      disclosure: { ...disclosure, primary: "hidden" },
      regions: [],
    })).toMatchObject({ ok: false, issue: { code: "INVALID_DISCLOSURE_POLICY", path: "$.disclosure.primary" } });

    expect(parseComposedExperience({
      planId: "plan-1",
      mode: "settled",
      layout: { family: "flow" },
      disclosure,
      regions: [{ id: "later", role: "deferred", capabilities: [] }],
    })).toMatchObject({ ok: false, issue: { code: "INVALID_REGIONS" } });
  });

  it("clones caller-owned nested data and rejects accessor-backed roots", () => {
    const regions = [{ id: "main", role: "primary", capabilities: [capability("select-date")] }];
    const parsed = parseComposedExperience({
      planId: "plan-1",
      mode: "resolve",
      layout: { family: "single-focus" },
      disclosure,
      regions,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const firstRegion = regions[0];
    const firstCapability = firstRegion?.capabilities[0];
    if (firstCapability) firstCapability.id = "mutated";
    expect(parsed.value.regions[0]?.capabilities[0]?.id).toBe("select-date");

    let calls = 0;
    const input: Record<string, unknown> = { planId: "plan-1", mode: "settled", layout: { family: "flow" }, disclosure };
    Object.defineProperty(input, "regions", {
      enumerable: true,
      get() {
        calls += 1;
        return [];
      },
    });
    expect(parseComposedExperience(input)).toMatchObject({ ok: false, issue: { code: "INVALID_TYPE", path: "$.regions" } });
    expect(calls).toBe(0);
  });
});
