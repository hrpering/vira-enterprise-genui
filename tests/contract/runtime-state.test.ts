import { describe, expect, it } from "vitest";
import { createRuntimeState } from "../../packages/runtime-core/src/index.js";

function planInput(): Record<string, unknown> {
  return {
    version: "1",
    id: "plan-1",
    intent: { version: "1", namespace: "travel.flight", name: "search" },
    state: { origin: "IST", destination: "BER", nested: { passengerCount: 1 } },
    capabilities: {
      required: [{ version: "1", id: "select-date" }],
    },
  };
}

describe("RuntimeState", () => {
  it("creates deterministic revision-zero state from a valid plan", () => {
    const result = createRuntimeState("experience-1", planInput());
    expect(result).toMatchObject({
      ok: true,
      value: { experienceId: "experience-1", revision: 0 },
    });
  });

  it("uses plan.state as the single task-state source of truth", () => {
    const result = createRuntimeState("experience-1", planInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.hasOwn(result.value, "taskState")).toBe(false);
    expect(result.value.plan.state).toMatchObject({ origin: "IST", destination: "BER" });
  });

  it("clones and recursively freezes caller-owned plan data", () => {
    const input = planInput();
    const originalState = input.state;
    const result = createRuntimeState("experience-1", input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.plan).not.toBe(input);
    expect(result.value.plan.state).not.toBe(originalState);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.plan)).toBe(true);
    expect(Object.isFrozen(result.value.plan.state)).toBe(true);
    expect(Object.isFrozen(result.value.plan.capabilities.required)).toBe(true);
    expect(Object.isFrozen(result.value.plan.state.nested)).toBe(true);
  });

  it("does not retain mutable caller references", () => {
    const input = planInput();
    const state = input.state as Record<string, unknown>;
    const result = createRuntimeState("experience-1", input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    state.origin = "SAW";
    expect(result.value.plan.state.origin).toBe("IST");
  });

  it("rejects invalid experience ids and invalid plans deterministically", () => {
    expect(createRuntimeState("bad id", planInput())).toMatchObject({
      ok: false,
      issue: { code: "INVALID_EXPERIENCE_ID", path: "$.experienceId" },
    });
    expect(createRuntimeState("experience-1", { ...planInput(), version: "2" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_PLAN", path: "$.plan.version" },
    });
  });

  it("is JSON serializable without runtime-specific objects", () => {
    const result = createRuntimeState("experience-1", planInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.parse(JSON.stringify(result.value))).toEqual(result.value);
  });
});
