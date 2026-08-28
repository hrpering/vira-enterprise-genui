import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  adaptActionEvent,
  adaptIntentAlias,
  createBrandProfile,
  matchRecipeIntent,
  normalizeDomainDataForAdapter,
  projectDomainData,
  resolveComponentForCapability,
  resolvePolicyRefsForRecipe,
} from "../../packages/adapter-sdk/src/index.js";
import { parseJsonValue } from "../../packages/protocol/src/index.js";
import { jsonRoundTrip } from "../helpers/index.js";

type Scenario = Readonly<Record<string, unknown>>;

type GoldenFile = {
  readonly version: "1";
  readonly scenarios: readonly Scenario[];
};

async function fixture(): Promise<GoldenFile> {
  const url = new URL("../fixtures/adapter-sdk/golden-integrations.v1.json", import.meta.url);
  const raw = JSON.parse(await readFile(url, "utf8")) as unknown;
  const canonical = parseJsonValue(raw);
  expect(canonical.ok).toBe(true);
  if (!canonical.ok) throw new Error(canonical.issue.reason);
  return canonical.value as unknown as GoldenFile;
}

function field(scenario: Scenario, name: string): unknown {
  return scenario[name];
}

function objectValue(value: unknown, label: string): Scenario {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Scenario;
}

describe("adapter-sdk deterministic golden integrations", () => {
  it("locks all eight adapter surfaces across travel and support", async () => {
    const golden = await fixture();
    expect(golden.version).toBe("1");
    expect(golden.scenarios).toHaveLength(2);

    for (const scenario of golden.scenarios) {
      const name = String(field(scenario, "name"));

      const brandInput = field(scenario, "brand");
      const brand = createBrandProfile(brandInput);
      expect(brand.ok, `${name}:brand`).toBe(true);
      if (!brand.ok) continue;
      expect(brand.value, `${name}:brand-exact`).toEqual(brandInput);
      expect(Object.isFrozen(brand.value), `${name}:brand-frozen`).toBe(true);

      const intent = adaptIntentAlias(field(scenario, "intentAdapter"), field(scenario, "intentInput"));
      expect(intent.ok, `${name}:intent`).toBe(true);
      if (!intent.ok) continue;
      expect(intent.value, `${name}:intent-exact`).toEqual(field(scenario, "expectedIntent"));

      const recipeInput = objectValue(field(scenario, "recipe"), `${name}:recipe-input`);
      const recipe = matchRecipeIntent(recipeInput, intent.value);
      expect(recipe.ok, `${name}:recipe`).toBe(true);
      if (!recipe.ok) continue;
      expect(recipe.value.version, `${name}:recipe-version`).toBe(recipeInput.version);
      expect(recipe.value.id, `${name}:recipe-id`).toBe(recipeInput.id);
      expect(recipe.value.intent, `${name}:recipe-intent`).toEqual(recipeInput.intent);
      expect(recipe.value.requiredState, `${name}:recipe-required-state`).toEqual(recipeInput.requiredState);
      expect(recipe.value.capabilityRequirements, `${name}:recipe-requirements`).toEqual(recipeInput.capabilityRequirements ?? []);
      expect(recipe.value.availableCapabilities, `${name}:recipe-available`).toEqual(recipeInput.availableCapabilities ?? []);
      expect(recipe.value.futureCapabilities, `${name}:recipe-future`).toEqual(recipeInput.futureCapabilities ?? []);

      const domainInput = field(scenario, "domainData");
      const domain = normalizeDomainDataForAdapter(field(scenario, "domainAdapter"), domainInput);
      expect(domain.ok, `${name}:domain`).toBe(true);
      if (!domain.ok) continue;
      expect(domain.value, `${name}:domain-exact`).toEqual(domainInput);

      const projection = projectDomainData(field(scenario, "dataAdapter"), domain.value);
      expect(projection.ok, `${name}:projection`).toBe(true);
      if (!projection.ok) continue;
      expect(jsonRoundTrip(projection.value), `${name}:projection-exact`).toEqual(field(scenario, "expectedProjection"));

      const component = resolveComponentForCapability(field(scenario, "componentAdapter"), field(scenario, "componentCapability"));
      expect(component, `${name}:component`).toEqual({ ok: true, value: field(scenario, "expectedComponent") });

      const action = adaptActionEvent(field(scenario, "actionAdapter"), field(scenario, "actionInput"));
      expect(action.ok, `${name}:action`).toBe(true);
      if (!action.ok) continue;
      expect(action.value, `${name}:action-exact`).toEqual(field(scenario, "expectedAction"));
      expect(Object.hasOwn(action.value, "id"), `${name}:no-action-id`).toBe(false);
      expect(Object.hasOwn(action.value, "source"), `${name}:no-action-source`).toBe(false);

      const policies = resolvePolicyRefsForRecipe(field(scenario, "policyAdapter"), recipe.value);
      expect(policies.ok, `${name}:policy`).toBe(true);
      if (!policies.ok) continue;
      expect(policies.value, `${name}:policy-exact`).toEqual(field(scenario, "expectedPolicyRefs"));

      for (const value of [brand.value, intent.value, recipe.value, domain.value, projection.value, action.value, policies.value]) {
        expect(jsonRoundTrip(value), `${name}:round-trip`).toEqual(value);
        expect(Object.isFrozen(value), `${name}:frozen`).toBe(true);
      }
    }
  });

  it("keeps critical integration failures closed", async () => {
    const golden = await fixture();
    const scenario = golden.scenarios[0];
    if (!scenario) throw new Error("missing golden scenario");

    expect(adaptIntentAlias(field(scenario, "intentAdapter"), { source: "UNKNOWN" })).toMatchObject({ ok: false, issue: { code: "UNMAPPED_SOURCE" } });
    expect(normalizeDomainDataForAdapter(field(scenario, "domainAdapter"), { ...(field(scenario, "domainData") as object), domain: "banking.transfer" })).toMatchObject({ ok: false, issue: { code: "DOMAIN_MISMATCH" } });
    expect(projectDomainData(field(scenario, "dataAdapter"), { ...(field(scenario, "domainData") as object), data: { departure: "IST" } })).toMatchObject({ ok: false, issue: { code: "MISSING_SOURCE_FIELD" } });
    expect(resolveComponentForCapability(field(scenario, "componentAdapter"), { version: "1", id: "unknown-capability" })).toMatchObject({ ok: false, issue: { code: "UNMAPPED_CAPABILITY" } });
    expect(adaptActionEvent(field(scenario, "actionAdapter"), { event: "unknown.event" })).toMatchObject({ ok: false, issue: { code: "UNMAPPED_EVENT" } });
    expect(resolvePolicyRefsForRecipe(field(scenario, "policyAdapter"), { ...(field(scenario, "recipe") as object), id: "travel.flight.unknown-recipe" })).toMatchObject({ ok: false, issue: { code: "UNMAPPED_RECIPE" } });
  });
});
