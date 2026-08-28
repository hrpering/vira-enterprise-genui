import { describe, expect, it } from "vitest";
import {
  createPolicyAdapterContract,
  resolvePolicyRefsForRecipe,
} from "../../packages/adapter-sdk/src/index.js";
import { jsonRoundTrip } from "../helpers/index.js";

const capability = (id: string) => ({ version: "1", id });

function recipe() {
  return {
    version: "1",
    id: "travel.flight.search-recipe",
    intent: { namespace: "travel.flight", name: "search" },
    requiredState: ["origin"],
    capabilityRequirements: [{ field: "origin", capability: capability("resolve-origin") }],
    availableCapabilities: [capability("submit-search")],
  };
}

function contract() {
  return {
    version: "1",
    id: "acme.composition.policy-map",
    mappings: [
      {
        recipe: "travel.flight.search-recipe",
        layoutPolicy: "acme.policy.layout.travel-search",
        disclosurePolicy: "acme.policy.disclosure.standard",
      },
    ],
  };
}

describe("adapter-sdk policy adapter", () => {
  it("resolves exact recipe IDs to semantic composition-policy references", () => {
    const result = resolvePolicyRefsForRecipe(contract(), recipe());
    expect(result).toEqual({
      ok: true,
      value: {
        layoutPolicy: "acme.policy.layout.travel-search",
        disclosurePolicy: "acme.policy.disclosure.standard",
      },
    });
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(jsonRoundTrip(result.value)).toEqual(result.value);
  });

  it("requires namespaced semantic references rather than raw policy values", () => {
    for (const value of ["flow", "immediate", "#fff", "https://example.com/policy", "allow-all"]) {
      expect(createPolicyAdapterContract({
        ...contract(),
        mappings: [{ ...contract().mappings[0]!, layoutPolicy: value }],
      })).toMatchObject({ ok: false, issue: { code: "INVALID_POLICY_REFERENCE" } });
    }
  });

  it("fails closed for unmapped recipes without a default fallback", () => {
    const other = { ...recipe(), id: "travel.flight.other-recipe" };
    expect(resolvePolicyRefsForRecipe(contract(), other)).toMatchObject({
      ok: false,
      issue: { code: "UNMAPPED_RECIPE", path: "$.recipe.id" },
    });
  });

  it("rejects duplicate recipe mappings", () => {
    expect(createPolicyAdapterContract({
      ...contract(),
      mappings: [...contract().mappings, { ...contract().mappings[0]!, layoutPolicy: "acme.policy.layout.other" }],
    })).toMatchObject({ ok: false, issue: { code: "DUPLICATE_RECIPE" } });
  });

  it("rejects authorization, security, role, network, callback, and concrete-policy fields", () => {
    for (const field of ["permission", "authorize", "roles", "claims", "networkPolicy", "allow", "deny", "callback", "execute", "layout", "disclosure", "css"]) {
      expect(createPolicyAdapterContract({ ...contract(), [field]: "forbidden" })).toMatchObject({
        ok: false,
        issue: { code: "UNKNOWN_FIELD", path: `$.${field}` },
      });
    }
  });

  it("validates recipe input through the recipe owner", () => {
    expect(resolvePolicyRefsForRecipe(contract(), { ...recipe(), id: "bad id" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_RECIPE", path: "$.id" },
    });
  });
});
