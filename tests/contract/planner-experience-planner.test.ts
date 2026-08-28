import { describe, expect, it } from "vitest";
import { planExperience } from "../../packages/planner/src/index.js";
import { jsonRoundTrip } from "../helpers/index.js";

const capability = (id: string) => ({ version: "1", id });

function baseInput() {
  return {
    id: "plan-1",
    intent: { version: "1", namespace: "travel.flight", name: "search" },
    state: { origin: "IST" },
    requiredState: ["origin", "destination", "departure-date"],
    candidateState: { destination: "BER" },
    capabilityRequirements: [
      { field: "departure-date", capability: capability("select-date") },
    ],
    availableCapabilities: [capability("edit-passengers")],
    futureCapabilities: [capability("display.flight-results")],
  };
}

describe("experience planner", () => {
  it("orchestrates state and capability resolution into a canonical ExperiencePlan", () => {
    const result = planExperience(baseInput());
    expect(result).toMatchObject({
      ok: true,
      value: {
        version: "1",
        id: "plan-1",
        intent: { namespace: "travel.flight", name: "search" },
        state: { origin: "IST", destination: "BER" },
        capabilities: {
          required: [{ id: "select-date" }],
          available: [{ id: "edit-passengers" }],
          future: [{ id: "display.flight-results" }],
        },
      },
    });
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.state)).toBe(true);
    expect(Object.isFrozen(result.value.capabilities.required)).toBe(true);
    expect(jsonRoundTrip(result.value)).toEqual(result.value);
  });

  it("preserves conflicting current state and plans an explicit conflict-resolution capability", () => {
    const result = planExperience({
      id: "plan-conflict",
      intent: { version: "1", namespace: "travel.flight", name: "search" },
      state: { origin: "IST" },
      requiredState: ["origin"],
      candidateState: { origin: "SAW" },
      capabilityRequirements: [{ field: "origin", capability: capability("resolve-origin") }],
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        state: { origin: "IST" },
        capabilities: { required: [{ id: "resolve-origin" }] },
      },
    });
  });

  it("fails closed when state blockers cannot be mapped to capabilities", () => {
    const input = baseInput();
    input.capabilityRequirements = [];
    expect(planExperience(input)).toMatchObject({
      ok: false,
      issue: { code: "CAPABILITY_RESOLUTION_FAILED", path: "$.capabilityRequirements" },
    });
  });

  it("delegates intent and final plan validation to Protocol", () => {
    expect(planExperience({ ...baseInput(), intent: { version: "2", namespace: "travel.flight", name: "search" } })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INTENT", path: "$.intent.version" },
    });
    expect(planExperience({ ...baseInput(), id: "bad id" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_PLAN", path: "$.id" },
    });
  });

  it("does not retain caller-owned state/candidates and produces deterministic output", () => {
    const input = baseInput();
    const first = planExperience(input);
    const second = planExperience(baseInput());
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    input.state.origin = "SAW";
    input.candidateState.destination = "AMS";
    expect(first.value.state).toEqual({ origin: "IST", destination: "BER" });
  });

  it("does not introduce presentation, action, policy, or component fields", () => {
    const result = planExperience(baseInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const field of ["regions", "layout", "actions", "bindings", "policies", "components", "props"]) {
      expect(Object.hasOwn(result.value, field)).toBe(false);
    }
  });
});
