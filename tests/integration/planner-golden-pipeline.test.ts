import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseJsonValue } from "../../packages/protocol/src/index.js";
import { planComposition, planExperience } from "../../packages/planner/src/index.js";
import { jsonRoundTrip } from "../helpers/index.js";

type GoldenCase = {
  readonly name: string;
  readonly input: unknown;
  readonly expectedPlan: unknown;
  readonly expectedComposition: unknown;
};

type GoldenFailure = {
  readonly name: string;
  readonly input: unknown;
  readonly expectedIssue: unknown;
};

type GoldenFile = {
  readonly version: "1";
  readonly cases: readonly GoldenCase[];
  readonly failures: readonly GoldenFailure[];
};

async function fixture(): Promise<GoldenFile> {
  const fixtureUrl = new URL("../fixtures/planner/golden-pipelines.v1.json", import.meta.url);
  const raw = JSON.parse(await readFile(fixtureUrl, "utf8")) as unknown;
  const canonical = parseJsonValue(raw);
  expect(canonical.ok).toBe(true);
  if (!canonical.ok) throw new Error(canonical.issue.reason);
  return canonical.value as unknown as GoldenFile;
}

describe("deterministic planner golden pipeline", () => {
  it("locks successful State -> Capability -> ExperiencePlan -> CompositionDirective behavior", async () => {
    const golden = await fixture();
    expect(golden.version).toBe("1");
    expect(golden.cases).toHaveLength(8);

    for (const scenario of golden.cases) {
      const firstPlan = planExperience(scenario.input);
      const secondPlan = planExperience(jsonRoundTrip(scenario.input));
      expect(firstPlan, scenario.name).toEqual(secondPlan);
      expect(firstPlan.ok, scenario.name).toBe(true);
      if (!firstPlan.ok) continue;
      expect(firstPlan.value, scenario.name).toEqual(scenario.expectedPlan);

      const firstComposition = planComposition(firstPlan.value);
      const secondComposition = planComposition(jsonRoundTrip(firstPlan.value));
      expect(firstComposition, scenario.name).toEqual(secondComposition);
      expect(firstComposition.ok, scenario.name).toBe(true);
      if (!firstComposition.ok) continue;
      expect(firstComposition.value, scenario.name).toEqual(scenario.expectedComposition);

      expect(Object.isFrozen(firstPlan.value), scenario.name).toBe(true);
      expect(Object.isFrozen(firstComposition.value), scenario.name).toBe(true);
      expect(jsonRoundTrip(firstPlan.value), scenario.name).toEqual(firstPlan.value);
      expect(jsonRoundTrip(firstComposition.value), scenario.name).toEqual(firstComposition.value);
    }
  });

  it("locks fail-closed planner boundaries", async () => {
    const golden = await fixture();
    expect(golden.failures.length).toBeGreaterThanOrEqual(4);

    for (const scenario of golden.failures) {
      const result = planExperience(scenario.input);
      expect(result.ok, scenario.name).toBe(false);
      if (result.ok) continue;
      expect(result.issue, scenario.name).toMatchObject(scenario.expectedIssue as object);
    }
  });

  it("keeps golden outputs free of presentation/execution surfaces", async () => {
    const golden = await fixture();
    const forbidden = ["regions", "layout", "components", "component", "props", "actions", "policies", "dom", "css"];

    for (const scenario of golden.cases) {
      const plan = planExperience(scenario.input);
      expect(plan.ok, scenario.name).toBe(true);
      if (!plan.ok) continue;
      for (const field of forbidden) expect(Object.hasOwn(plan.value, field), `${scenario.name}:${field}`).toBe(false);

      const composition = planComposition(plan.value);
      expect(composition.ok, scenario.name).toBe(true);
      if (!composition.ok) continue;
      for (const field of forbidden) expect(Object.hasOwn(composition.value, field), `${scenario.name}:${field}`).toBe(false);
    }
  });
});
