import { describe, expect, it } from "vitest";
import {
  reviewViraPolicySimulation,
  simulateViraPolicyChange,
  type ViraPolicySimulationEvaluator,
} from "../../packages/policy-simulation/src/index.js";

function evaluator(policyRef: string, effects: Record<string, "allow" | "deny" | "challenge" | "transform">): ViraPolicySimulationEvaluator {
  return {
    version: "1",
    id: "policy.simulator",
    policyRef,
    evaluate: (fixture) => ({
      version: "1",
      effect: effects[fixture.id] ?? "allow",
      reasonCode: `${policyRef}:${fixture.id}`,
    }),
  };
}

const fixtures = [
  { id: "fixture-1", input: { amount: 10 } },
  { id: "fixture-2", input: { amount: 1000 } },
  { id: "fixture-3", input: { amount: 5000 } },
];

describe("MASTER-10 policy simulation", () => {
  it("diffs current and candidate decisions over the exact same fixture set", async () => {
    const result = await simulateViraPolicyChange({
      fixtureSetId: "historical.refunds.v1",
      fixtures,
      current: evaluator("policy:current:v1", {
        "fixture-1": "allow",
        "fixture-2": "allow",
        "fixture-3": "challenge",
      }),
      candidate: evaluator("policy:candidate:v2", {
        "fixture-1": "allow",
        "fixture-2": "deny",
        "fixture-3": "allow",
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.summary).toMatchObject({
      fixtures: 3,
      unchanged: 1,
      newDenies: 1,
      newAllows: 1,
      changedEffects: 0,
    });
    expect(result.value.newDenyFixtureIds).toEqual(["fixture-2"]);
    expect(result.value.cases.map((entry) => entry.kind)).toEqual(["unchanged", "new-deny", "new-allow"]);
    expect(result.value.currentPolicyRef).toBe("policy:current:v1");
    expect(result.value.candidatePolicyRef).toBe("policy:candidate:v2");
  });

  it("fails closed when either evaluator fails or returns malformed output", async () => {
    const failed = await simulateViraPolicyChange({
      fixtureSetId: "fixtures.v1",
      fixtures: [fixtures[0]!],
      current: evaluator("policy:current:v1", {}),
      candidate: {
        version: "1",
        id: "policy.simulator",
        policyRef: "policy:candidate:v2",
        evaluate: () => { throw new Error("boom"); },
      },
    });
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.issue.code).toBe("EVALUATOR_FAILED");

    const malformed = await simulateViraPolicyChange({
      fixtureSetId: "fixtures.v1",
      fixtures: [fixtures[0]!],
      current: evaluator("policy:current:v1", {}),
      candidate: {
        version: "1",
        id: "policy.simulator",
        policyRef: "policy:candidate:v2",
        evaluate: () => ({ effect: "allow" }),
      },
    });
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) expect(malformed.issue.code).toBe("INVALID_DECISION");
  });

  it("requires exact distinct policy refs and unique bounded fixtures", async () => {
    const same = await simulateViraPolicyChange({
      fixtureSetId: "fixtures.v1",
      fixtures: [fixtures[0]!],
      current: evaluator("policy:same", {}),
      candidate: evaluator("policy:same", {}),
    });
    expect(same.ok).toBe(false);
    if (!same.ok) expect(same.issue.code).toBe("INVALID_EVALUATOR");

    const duplicate = await simulateViraPolicyChange({
      fixtureSetId: "fixtures.v1",
      fixtures: [fixtures[0]!, fixtures[0]!],
      current: evaluator("policy:current", {}),
      candidate: evaluator("policy:candidate", {}),
    });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.issue.code).toBe("INVALID_FIXTURES");
  });

  it("blocks approval until every new deny is explicitly acknowledged", async () => {
    const result = await simulateViraPolicyChange({
      fixtureSetId: "fixtures.v1",
      fixtures,
      current: evaluator("policy:current", { "fixture-1": "allow", "fixture-2": "allow", "fixture-3": "allow" }),
      candidate: evaluator("policy:candidate", { "fixture-1": "deny", "fixture-2": "deny", "fixture-3": "allow" }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const incomplete = reviewViraPolicySimulation(result.value, {
      reviewerId: "reviewer-1",
      decision: "approved",
      acknowledgedNewDenyFixtureIds: ["fixture-1"],
    });
    expect(incomplete.ok).toBe(false);

    const approved = reviewViraPolicySimulation(result.value, {
      reviewerId: "reviewer-1",
      decision: "approved",
      acknowledgedNewDenyFixtureIds: ["fixture-1", "fixture-2"],
      note: "reviewed expected denies",
    });
    expect(approved.ok).toBe(true);
    if (approved.ok) {
      expect(approved.value.publishEligible).toBe(true);
      expect(approved.value.candidatePolicyRef).toBe("policy:candidate");
    }
  });

  it("never marks a rejected review publish eligible", async () => {
    const result = await simulateViraPolicyChange({
      fixtureSetId: "fixtures.v1",
      fixtures: [fixtures[0]!],
      current: evaluator("policy:current", {}),
      candidate: evaluator("policy:candidate", {}),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const review = reviewViraPolicySimulation(result.value, {
      reviewerId: "reviewer-1",
      decision: "rejected",
      acknowledgedNewDenyFixtureIds: [],
    });
    expect(review.ok).toBe(true);
    if (review.ok) expect(review.value.publishEligible).toBe(false);
  });
});
