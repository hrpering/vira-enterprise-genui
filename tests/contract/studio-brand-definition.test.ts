import { describe, expect, it } from "vitest";
import {
  createStudioBrandPackage,
  defineViraBrand,
  VIRA_BRAND_PLATFORM_KEYS,
  type ViraBrandDefinitionInput,
} from "../../packages/studio-brand/src/index.js";
import { jsonRoundTrip } from "../helpers/index.js";

function brandDefinition(brandId = "alpha.catalog", displayName = "Alpha Catalog") {
  const card = `${brandId}.component.card`;
  const badge = `${brandId}.component.badge`;
  const recipe = `${brandId}.recipe.browse`;
  return {
    identity: {
      version: "1",
      id: brandId,
      displayName,
      tokenRefs: {},
    },
    design: {
      palette: {
        $type: "color",
        primary: {
          $value: {
            colorSpace: "srgb",
            components: [17 / 255, 34 / 255, 51 / 255],
            hex: "#112233",
          },
        },
      },
      typography: {
        body: { $type: "fontFamily", $value: ["Inter", "Arial"] },
      },
    },
    components: {
      catalog: {
        version: "1",
        id: `${brandId}.components`,
        brandId,
        components: [
          {
            ref: card,
            label: "Card",
            category: "content.card",
            kind: "content",
            props: [{ key: "title", type: "string", required: true, bindable: true }],
            slots: [],
            events: [{ name: "select", label: "Selected" }],
          },
          {
            ref: badge,
            label: "Badge",
            category: "content.badge",
            kind: "content",
            props: [],
            slots: [],
            events: [],
          },
        ],
      },
      implementations: [
        {
          component: badge,
          web: `${brandId}.web.badge.v1`,
          ios: `${brandId}.ios.badge.v1`,
          android: `${brandId}.android.badge.v1`,
        },
        {
          component: card,
          web: `${brandId}.web.card.v1`,
          ios: `${brandId}.ios.card.v1`,
          android: `${brandId}.android.card.v1`,
        },
      ],
    },
    actions: {
      version: "1",
      id: `${brandId}.actions`,
      mappings: [{ event: "item.select", actionType: `${brandId}.action.select` }],
    },
    dataSources: {
      version: "1",
      id: `${brandId}.data`,
      sources: [{ kind: "domain", path: "catalog.title", label: "Catalog title", valueType: "string" }],
    },
    policies: {
      version: "1",
      id: `${brandId}.policies`,
      mappings: [{
        recipe,
        layoutPolicy: `${brandId}.policy.layout.default`,
        disclosurePolicy: `${brandId}.policy.disclosure.default`,
      }],
    },
    experiences: [{
      id: "browse",
      label: "Browse",
      description: "Synthetic catalog experience.",
      document: {
        version: "1",
        id: `${brandId}.experience.browse`,
        recipeId: recipe,
        entryView: "main",
        views: [{
          id: "main",
          nodes: [{ id: "root", component: card, order: 0, props: { title: "Browse items" } }],
        }],
        bindings: [],
        interactions: [{
          viewId: "main",
          nodeId: "root",
          event: "select",
          actionEvent: "item.select",
          routes: [],
        }],
      },
    }],
  } satisfies ViraBrandDefinitionInput;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function asUntrusted(value: unknown): ViraBrandDefinitionInput {
  return value as ViraBrandDefinitionInput;
}

describe("MASTER-03 brand integration SDK", () => {
  it("lowers ergonomic brand input to the existing canonical package with deterministic platform mappings", () => {
    const input = brandDefinition();
    const result = defineViraBrand(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const direct = createStudioBrandPackage({
      version: "1",
      id: input.identity.id,
      brand: input.identity,
      components: input.components.catalog,
      dataSources: input.dataSources,
      actions: input.actions,
      templates: input.experiences,
    });
    expect(direct.ok).toBe(true);
    if (!direct.ok) return;

    expect(result.value.package).toEqual(direct.value);
    expect(result.value.design.options).toEqual({
      colorMode: "palette",
      colors: ["#112233"],
      fonts: ["Inter, Arial"],
    });
    expect(result.value.policies).toMatchObject({ id: "alpha.catalog.policies" });
    expect(result.value.implementations.map((entry) => entry.component)).toEqual([
      "alpha.catalog.component.card",
      "alpha.catalog.component.badge",
    ]);
    expect(VIRA_BRAND_PLATFORM_KEYS).toEqual(["web", "ios", "android"]);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.implementations)).toBe(true);
    expect(result.value.implementations.every((entry) => Object.isFrozen(entry))).toBe(true);
    expect(jsonRoundTrip(result.value.package)).toEqual(result.value.package);
  });

  it("defines a materially different second synthetic brand without core domain branching", () => {
    const result = defineViraBrand(brandDefinition("northstar.workspace", "Northstar Workspace"));
    expect(result).toMatchObject({
      ok: true,
      value: {
        package: { brand: { id: "northstar.workspace" } },
        policies: { id: "northstar.workspace.policies" },
      },
    });
  });

  it("requires policy coverage for every included experience while allowing unrelated extra mappings", () => {
    const missing = clone(brandDefinition());
    missing.policies.mappings[0]!.recipe = "alpha.catalog.recipe.other";
    expect(defineViraBrand(missing)).toMatchObject({
      ok: false,
      issue: {
        stage: "policies",
        code: "UNMAPPED_RECIPE",
        path: "$.experiences[0].document.recipeId",
      },
    });

    const extra = clone(brandDefinition());
    extra.policies.mappings.push({
      recipe: "alpha.catalog.recipe.unused",
      layoutPolicy: "alpha.catalog.policy.layout.unused",
      disclosurePolicy: "alpha.catalog.policy.disclosure.unused",
    });
    expect(defineViraBrand(extra)).toMatchObject({ ok: true });
  });

  it("preserves canonical brand/package failures instead of bypassing them", () => {
    const mismatched = clone(brandDefinition());
    mismatched.components.catalog.brandId = "other.brand";
    expect(defineViraBrand(mismatched)).toMatchObject({
      ok: false,
      issue: { stage: "package", code: "BRAND_ID_MISMATCH", path: "$.components.brandId" },
    });

    const unknownComponent = clone(brandDefinition());
    unknownComponent.experiences[0]!.document.views[0]!.nodes[0]!.component = "other.component.card";
    expect(defineViraBrand(unknownComponent)).toMatchObject({
      ok: false,
      issue: { stage: "package", code: "INVALID_TEMPLATE_DOCUMENT" },
    });

    const unknownAction = clone(brandDefinition());
    unknownAction.experiences[0]!.document.interactions[0]!.actionEvent = "item.delete";
    expect(defineViraBrand(unknownAction)).toMatchObject({
      ok: false,
      issue: { stage: "package", code: "INVALID_TEMPLATE_DOCUMENT" },
    });

    const duplicateExperience = clone(brandDefinition());
    duplicateExperience.experiences.push(clone(duplicateExperience.experiences[0]!));
    expect(defineViraBrand(duplicateExperience)).toMatchObject({
      ok: false,
      issue: { stage: "package", code: "DUPLICATE_TEMPLATE" },
    });
  });

  it("requires platform implementation mappings to exactly match the semantic component catalog", () => {
    const missing = clone(brandDefinition());
    missing.components.implementations.pop();
    expect(defineViraBrand(missing)).toMatchObject({
      ok: false,
      issue: { stage: "implementations", code: "MISSING_COMPONENT" },
    });

    const duplicate = clone(brandDefinition());
    duplicate.components.implementations.push(clone(duplicate.components.implementations[0]!));
    expect(defineViraBrand(duplicate)).toMatchObject({
      ok: false,
      issue: { stage: "implementations", code: "DUPLICATE_COMPONENT" },
    });

    const extra = clone(brandDefinition());
    extra.components.implementations.push({
      component: "other.component.card",
      web: "other.web.card.v1",
      ios: "other.ios.card.v1",
      android: "other.android.card.v1",
    });
    const extraResult = defineViraBrand(extra);
    expect(extraResult).toMatchObject({
      ok: false,
      issue: { stage: "implementations", code: "UNREGISTERED_COMPONENT" },
    });
    if (!extraResult.ok) {
      expect(extraResult.issue.message).not.toContain("other.component.card");
    }
  });

  it("rejects URL, path, script, missing-platform and unknown-platform implementation metadata", () => {
    for (const invalid of [
      "https://evil.example/card.js",
      "javascript:alert(1)",
      "../renderer/card",
      "/absolute/renderer",
      "renderer",
    ]) {
      const input = clone(brandDefinition());
      input.components.implementations[0]!.web = invalid;
      expect(defineViraBrand(input), invalid).toMatchObject({
        ok: false,
        issue: { stage: "implementations", code: "INVALID_IMPLEMENTATION_ID" },
      });
    }

    const missingPlatform = clone(brandDefinition()) as unknown as Record<string, unknown>;
    const components = missingPlatform.components as { implementations: Array<Record<string, unknown>> };
    delete components.implementations[0]!.ios;
    expect(defineViraBrand(asUntrusted(missingPlatform))).toMatchObject({
      ok: false,
      issue: { stage: "implementations", code: "MISSING_FIELD" },
    });

    const unknownPlatform = clone(brandDefinition()) as unknown as Record<string, unknown>;
    const unknownComponents = unknownPlatform.components as { implementations: Array<Record<string, unknown>> };
    unknownComponents.implementations[0]!.windows = "alpha.catalog.windows.card.v1";
    expect(defineViraBrand(asUntrusted(unknownPlatform))).toMatchObject({
      ok: false,
      issue: { stage: "implementations", code: "UNKNOWN_FIELD" },
    });
  });

  it("fails closed on unknown top-level/backend fields, executable metadata, and unsafe object shapes", () => {
    expect(defineViraBrand(asUntrusted({ ...brandDefinition(), endpoint: "https://customer.example/api" }))).toMatchObject({
      ok: false,
      issue: { stage: "input", code: "UNKNOWN_FIELD", path: "$.endpoint" },
    });
    expect(defineViraBrand(asUntrusted({ ...brandDefinition(), apiKey: "secret" }))).toMatchObject({
      ok: false,
      issue: { stage: "input", code: "UNKNOWN_FIELD", path: "$.apiKey" },
    });
    expect(defineViraBrand(asUntrusted({ ...brandDefinition(), renderer: () => undefined }))).toMatchObject({
      ok: false,
      issue: { stage: "input", code: "INVALID_INPUT" },
    });

    const accessor = brandDefinition();
    Object.defineProperty(accessor, "endpoint", { enumerable: true, get: () => "secret" });
    expect(defineViraBrand(accessor)).toMatchObject({
      ok: false,
      issue: { stage: "input", code: "INVALID_INPUT" },
    });
  });

  it("delegates design, policy, data-source, and catalog errors to their canonical validators", () => {
    const badDesign = clone(brandDefinition()) as unknown as Record<string, unknown>;
    badDesign.design = { font: { $type: "fontFamily", $value: "Inter;url(https://evil.example)" } };
    expect(defineViraBrand(asUntrusted(badDesign))).toMatchObject({
      ok: false,
      issue: { stage: "design", code: "INVALID_FONT_FAMILY" },
    });

    const badPolicy = clone(brandDefinition()) as unknown as Record<string, unknown>;
    (badPolicy.policies as Record<string, unknown>).endpoint = "https://policy.example";
    expect(defineViraBrand(asUntrusted(badPolicy))).toMatchObject({
      ok: false,
      issue: { stage: "policies", code: "UNKNOWN_FIELD" },
    });

    const badData = clone(brandDefinition());
    badData.dataSources.sources.push(clone(badData.dataSources.sources[0]!));
    expect(defineViraBrand(badData)).toMatchObject({
      ok: false,
      issue: { stage: "dataSources", code: "DUPLICATE_SOURCE" },
    });

    const badCatalog = clone(brandDefinition());
    badCatalog.components.catalog.components.push(clone(badCatalog.components.catalog.components[0]!));
    expect(defineViraBrand(badCatalog)).toMatchObject({
      ok: false,
      issue: { stage: "components", code: "DUPLICATE_COMPONENT" },
    });
  });
});