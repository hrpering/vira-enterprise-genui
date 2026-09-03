import { describe, expect, it } from "vitest";
import {
  reviewViraPolicySimulation,
  simulateViraPolicyChange,
  type ViraPolicySimulationEvaluator,
} from "../../packages/policy-simulation/src/index.js";

function evaluator(policyRef: string, mutate = false): ViraPolicySimulationEvaluator {
  return {
    version: "1",
    id: "policy.simulator",
    policyRef,
    evaluate: (fixture) => {
      if (mutate) {
        expect(Object.isFrozen(fixture)).toBe(true);
        expect(Object.isFrozen(fixture.input)).toBe(true);
        expect(Object.isFrozen((fixture.input.nested as { value: number }))).toBe(true);
        try { (fixture.input.nested as { value: number }).value = 999; } catch {}
      }
      return { version: "1", effect: "allow", reasonCode: policyRef };
    },
  };
}

describe("MASTER-10 simulation integrity", () => {
  it("deep-freezes normalized fixture input before either evaluator runs", async () => {
    const result = await simulateViraPolicyChange({
      fixtureSetId: "fixtures.integrity.v1",
      fixtures: [{ id: "fixture-1", input: { nested: { value: 1 } } }],
      current: evaluator("policy:current", true),
      candidate: evaluator("policy:candidate"),
    });
    expect(result.ok).toBe(true);
  });

  it("rejects internally inconsistent forged reports before review", async () => {
    const result = await simulateViraPolicyChange({
      fixtureSetId: "fixtures.integrity.v1",
      fixtures: [{ id: "fixture-1", input: { value: 1 } }],
      current: evaluator("policy:current"),
      candidate: evaluator("policy:candidate"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const forged = {
      ...result.value,
      summary: { ...result.value.summary, newDenies: 1 },
    };
    const review = reviewViraPolicySimulation(forged, {
      reviewerId: "reviewer-1",
      decision: "approved",
      acknowledgedNewDenyFixtureIds: [],
    });
    expect(review.ok).toBe(false);
    if (!review.ok) expect(review.issue.code).toBe("INVALID_REVIEW");
  });
});
