import { describe, expect, it } from "vitest";
import { parseViraExperiencePackComposition } from "../../packages/experience-pack-compositions/src/index.js";

const document = {
  version: "1",
  id: "demo.checkout",
  recipeId: "demo.checkout.recipe",
  entryView: "main",
  views: [{ id: "main", nodes: [{ id: "root", component: "core.text", order: 0, props: {} }] }],
  bindings: [],
  interactions: [],
};

describe("MASTER-22 Experience Pack compositions", () => {
  it("accepts canonical reusable flow content and policy references", () => {
    const result = parseViraExperiencePackComposition({
      version: "1",
      id: "commerce.checkout",
      domain: "commerce.checkout",
      document,
      policyTemplates: [{ id: "checkout.guard", provider: "policy.opa", policyRef: "policies/checkout/v1" }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(result.value.document.id).toBe("demo.checkout");
    }
  });

  it("rejects policy bodies or executable template fields", () => {
    const result = parseViraExperiencePackComposition({
      version: "1",
      id: "commerce.checkout",
      domain: "commerce.checkout",
      document,
      policyTemplates: [{ id: "checkout.guard", provider: "policy.opa", policyRef: "policies/checkout/v1", rego: "allow := true" }],
    });
    expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_POLICY_TEMPLATE" } });
  });

  it("delegates flow validation to the canonical Studio document parser", () => {
    const result = parseViraExperiencePackComposition({
      version: "1",
      id: "commerce.checkout",
      domain: "commerce.checkout",
      document: { ...document, views: [] },
      policyTemplates: [],
    });
    expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_DOCUMENT" } });
  });

  it("rejects duplicate policy template identities", () => {
    const template = { id: "checkout.guard", provider: "policy.opa", policyRef: "policies/checkout/v1" };
    const result = parseViraExperiencePackComposition({
      version: "1",
      id: "commerce.checkout",
      domain: "commerce.checkout",
      document,
      policyTemplates: [template, template],
    });
    expect(result).toMatchObject({ ok: false, issue: { code: "DUPLICATE_POLICY_TEMPLATE" } });
  });
});
