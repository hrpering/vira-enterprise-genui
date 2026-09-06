import { describe, expect, it } from "vitest";
import {
  COMMERCE_BRAND_PACKAGE_INPUT,
  COMMERCE_COMPONENTS,
} from "../../examples/commerce-brand-kit/src/index.js";
import {
  COMMERCE_STUDIO_AI_HOST_MANIFESTS,
  generateCommerceStudioAiDraft,
} from "../../examples/experience-studio-demo/src/ai-authoring.js";

const baseDocument = COMMERCE_BRAND_PACKAGE_INPUT.templates[0]!.document;

describe("PROD-06 Studio AI v2 product composition", () => {
  it("accepts a universal-host-compatible proposal without changing immutable identity", async () => {
    const result = await generateCommerceStudioAiDraft(
      baseDocument,
      "Make the add to cart action clearer.",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`${result.issue.code}: ${result.issue.message}`);

    expect(result.value.id).toBe(baseDocument.id);
    expect(result.value.recipeId).toBe(baseDocument.recipeId);
    const addNode = result.value.views
      .flatMap((view) => view.nodes)
      .find((node) => node.component === COMMERCE_COMPONENTS.addButton);
    expect(addNode?.props.label).toBe("Add item securely");
    expect(baseDocument.views[0]!.nodes.find((node) => node.component === COMMERCE_COMPONENTS.addButton)?.props.label)
      .toBe("Add to cart");
  });

  it("fails closed when a provider proposal attempts to rewrite the Experience identity", async () => {
    const result = await generateCommerceStudioAiDraft(
      baseDocument,
      "Change the experience id to commerce.other.experience.",
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("identity takeover candidate unexpectedly passed Studio AI v2");
    expect(result.issue).toEqual(expect.objectContaining({
      code: "IDENTITY_MISMATCH",
      path: "$.candidate",
    }));
    expect(baseDocument.id).toBe("commerce.template.product-card");
  });

  it("fails closed when the three Host manifests no longer share a Brand component", async () => {
    const hostManifests = COMMERCE_STUDIO_AI_HOST_MANIFESTS.map((manifest) => manifest.platform === "android"
      ? { ...manifest, implementationIds: [] }
      : manifest);
    const result = await generateCommerceStudioAiDraft(
      baseDocument,
      "Make the add to cart action clearer.",
      { hostManifests },
    );

    expect(result).toEqual({
      ok: false,
      issue: {
        code: "NO_COMMON_COMPONENTS",
        path: "$.requestedPlatforms",
        message: "web, ios and android do not share any Brand component supported by every Host",
      },
    });
  });
});
