import { describe, expect, it } from "vitest";
import { EXPERIENCE_PLAN_MAX_CAPABILITIES } from "../../packages/protocol/src/index.js";
import {
  createExperienceRecipe,
  matchRecipeIntent,
} from "../../packages/adapter-sdk/src/index.js";
import { jsonRoundTrip } from "../helpers/index.js";

const capability = (id: string) => ({ version: "1", id });

function recipe() {
  return {
    version: "1",
    id: "travel.flight.search-recipe",
    intent: { namespace: "travel.flight", name: "search" },
    requiredState: ["origin", "destination", "departure-date"],
    capabilityRequirements: [
      { field: "origin", capability: capability("resolve-origin") },
      { field: "destination", capability: capability("resolve-destination") },
      { field: "departure-date", capability: capability("select-date") },
    ],
    availableCapabilities: [capability("edit-passengers"), capability("submit-search")],
    futureCapabilities: [capability("display.flight-results")],
  };
}

describe("adapter-sdk experience recipe", () => {
  it("creates an immutable deterministic planning blueprint", () => {
    const result = createExperienceRecipe(recipe());
    expect(result).toMatchObject({
      ok: true,
      value: {
        intent: { namespace: "travel.flight", name: "search" },
        requiredState: ["origin", "destination", "departure-date"],
        capabilityRequirements: [{ field: "origin", capability: { id: "resolve-origin" } }],
      },
    });
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.capabilityRequirements)).toBe(true);
    expect(jsonRoundTrip(result.value)).toEqual(result.value);
  });

  it("matches recipes by exact canonical intent identity only", () => {
    expect(matchRecipeIntent(recipe(), {
      version: "1",
      namespace: "travel.flight",
      name: "search",
      confidence: 0.01,
      parameters: { q: "ignored for selection" },
    })).toMatchObject({ ok: true });
    expect(matchRecipeIntent(recipe(), { version: "1", namespace: "travel.flight", name: "compare" })).toMatchObject({
      ok: false,
      issue: { code: "INTENT_MISMATCH", path: "$.intent" },
    });
  });

  it("requires capability requirement fields to exist in requiredState", () => {
    expect(createExperienceRecipe({
      ...recipe(),
      capabilityRequirements: [{ field: "cabin", capability: capability("select-cabin") }],
    })).toMatchObject({ ok: false, issue: { code: "UNDECLARED_REQUIREMENT_FIELD" } });
  });

  it("rejects duplicate capability identity across all recipe positions", () => {
    expect(createExperienceRecipe({ ...recipe(), availableCapabilities: [capability("resolve-origin")] })).toMatchObject({
      ok: false,
      issue: { code: "DUPLICATE_CAPABILITY" },
    });
  });

  it("shares the ExperiencePlan total capability limit", () => {
    const many = Array.from({ length: EXPERIENCE_PLAN_MAX_CAPABILITIES }, (_, index) => capability(`cap-${index}`));
    expect(createExperienceRecipe({
      version: "1",
      id: "test.recipe",
      intent: { namespace: "test.domain", name: "run" },
      requiredState: ["input"],
      capabilityRequirements: [{ field: "input", capability: capability("resolve-input") }],
      availableCapabilities: many,
    })).toMatchObject({ ok: false, issue: { code: "CAPABILITY_LIMIT_EXCEEDED" } });
  });

  it("rejects layout/component/action/data/model/execution fields", () => {
    for (const field of ["layout", "disclosure", "component", "props", "actions", "data", "endpoint", "model", "prompt", "execute", "permission"]) {
      expect(createExperienceRecipe({ ...recipe(), [field]: "forbidden" })).toMatchObject({
        ok: false,
        issue: { code: "UNKNOWN_FIELD", path: `$.${field}` },
      });
    }
  });

  it("does not retain caller-owned capability objects", () => {
    const input = recipe();
    const first = input.availableCapabilities[0];
    const result = createExperienceRecipe(input);
    expect(result.ok).toBe(true);
    if (!result.ok || !first) return;
    first.id = "mutated";
    expect(result.value.availableCapabilities[0]?.id).toBe("edit-passengers");
  });
});
