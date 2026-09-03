import {
  COMMERCE_BRAND_PACKAGE_INPUT,
  COMMERCE_COMPONENTS,
  commerceAuthoringRenderers,
  commerceRuntimeRenderers,
} from "../../examples/commerce-brand-kit/src/index.js";
import { createActiveStudioBrand } from "../../packages/studio-brand-loader/src/index.js";
import type { ActiveStudioBrand } from "../../packages/studio-brand-loader/src/index.js";
import { createStudioWorkbenchSession } from "../../packages/studio-workbench/src/index.js";
import { describe, expect, it } from "vitest";

const SUPPORT_COMPONENTS = Object.freeze({
  stack: "support.layout.stack",
  message: "support.component.message",
} as const);

const SUPPORT_BRAND_PACKAGE_INPUT = Object.freeze({
  version: "1",
  id: "support.reference.package",
  brand: {
    version: "1",
    id: "support.brand",
    displayName: "Support Reference",
    tokenRefs: {},
  },
  components: {
    version: "1",
    id: "support.studio.components",
    brandId: "support.brand",
    components: [
      {
        ref: SUPPORT_COMPONENTS.stack,
        label: "Support stack",
        category: "support.layout",
        kind: "layout",
        props: [],
        slots: [{ name: "content", label: "Content" }],
        events: [],
      },
      {
        ref: SUPPORT_COMPONENTS.message,
        label: "Support message",
        category: "support.content",
        kind: "content",
        props: [{ key: "text", type: "string", required: true, bindable: false }],
        slots: [],
        events: [],
      },
    ],
  },
  dataSources: { version: "1", id: "support.studio.data", sources: [] },
  actions: { version: "1", id: "support.studio.actions", mappings: [] },
  templates: [{
    id: "support-card",
    label: "Support card",
    description: "Second independent reference Brand for loader isolation.",
    document: {
      version: "1",
      id: "support.template.card",
      recipeId: "support.card",
      entryView: "main",
      views: [{
        id: "main",
        nodes: [
          { id: "root", component: SUPPORT_COMPONENTS.stack, order: 0, props: {} },
          { id: "message", component: SUPPORT_COMPONENTS.message, parentId: "root", slot: "content", order: 0, props: { text: "How can we help?" } },
        ],
      }],
      bindings: [],
      interactions: [],
    },
  }],
} as const);

const supportAuthoringRenderers = Object.freeze({
  [SUPPORT_COMPONENTS.stack]: () => null,
  [SUPPORT_COMPONENTS.message]: () => null,
});
const supportRuntimeRenderers = Object.freeze({
  [SUPPORT_COMPONENTS.stack]: () => null,
  [SUPPORT_COMPONENTS.message]: () => null,
});

function sessionFor(
  active: ActiveStudioBrand,
  templateId: string,
  experienceId: string,
) {
  const instance = active.instantiateTemplate(templateId, experienceId);
  if (!instance.ok) throw new Error(instance.issue.message);
  let sequence = 0;
  const session = createStudioWorkbenchSession({
    document: instance.value,
    componentCatalog: active.package.components,
    bindingSourceCatalog: active.package.dataSources,
    actionAdapter: active.package.actions,
    allocateNodeId: ({ component }) => `${component.split(".").at(-1) ?? "node"}-${++sequence}`.toLowerCase(),
  });
  if (!session.ok) throw new Error(session.issue.message);
  return session.value;
}

describe("Studio active brand loader", () => {
  it("loads two unrelated brands through the same generic loader with isolated surfaces", () => {
    const support = createActiveStudioBrand({
      brandPackage: SUPPORT_BRAND_PACKAGE_INPUT,
      authoringRenderers: supportAuthoringRenderers,
      runtimeRenderers: supportRuntimeRenderers,
    });
    const commerce = createActiveStudioBrand({
      brandPackage: COMMERCE_BRAND_PACKAGE_INPUT,
      authoringRenderers: commerceAuthoringRenderers,
      runtimeRenderers: commerceRuntimeRenderers,
    });
    expect(support.ok).toBe(true);
    expect(commerce.ok).toBe(true);
    if (!support.ok || !commerce.ok) return;

    expect(support.value.package.brand.id).toBe("support.brand");
    expect(commerce.value.package.brand.id).toBe("commerce.brand");
    expect(support.value.templateIds).toEqual(["support-card"]);
    expect(support.value.templateIds).not.toContain("product-card");
    expect(commerce.value.templateIds).toEqual(["product-card"]);
    expect(commerce.value.package.components.components.map((component) => component.ref)).toEqual([
      COMMERCE_COMPONENTS.stack,
      COMMERCE_COMPONENTS.title,
      COMMERCE_COMPONENTS.price,
      COMMERCE_COMPONENTS.addButton,
    ]);
    expect(commerce.value.package.dataSources.sources.map((source) => source.path)).toEqual([
      "product.title",
      "product.price",
    ]);
    expect(commerce.value.package.actions.mappings).toEqual([
      { event: "product.add", actionType: "commerce.cart.add" },
    ]);
  });

  it("instantiates each brand into the same workbench factory without cross-brand leakage", () => {
    const support = createActiveStudioBrand({
      brandPackage: SUPPORT_BRAND_PACKAGE_INPUT,
      authoringRenderers: supportAuthoringRenderers,
      runtimeRenderers: supportRuntimeRenderers,
    });
    const commerce = createActiveStudioBrand({
      brandPackage: COMMERCE_BRAND_PACKAGE_INPUT,
      authoringRenderers: commerceAuthoringRenderers,
      runtimeRenderers: commerceRuntimeRenderers,
    });
    if (!support.ok || !commerce.ok) throw new Error("reference brands must load");

    const supportSession = sessionFor(support.value, "support-card", "demo.support.switch");
    const commerceSession = sessionFor(commerce.value, "product-card", "demo.commerce.switch");

    expect(supportSession.componentCatalog().components.every((component) => component.ref.startsWith("support."))).toBe(true);
    expect(commerceSession.componentCatalog().components.every((component) => component.ref.startsWith("commerce."))).toBe(true);
    expect(commerceSession.bindingSourceCatalog().sources.every((source) => source.path.startsWith("product."))).toBe(true);
    expect(commerceSession.actionAdapter().mappings.every((mapping) => mapping.actionType.startsWith("commerce."))).toBe(true);

    expect(createStudioWorkbenchSession({
      document: supportSession.currentDocument(),
      componentCatalog: commerce.value.package.components,
      bindingSourceCatalog: commerce.value.package.dataSources,
      actionAdapter: commerce.value.package.actions,
      allocateNodeId: () => "node",
    })).toMatchObject({ ok: false, issue: { code: "INVALID_INPUT" } });
  });

  it("rejects missing and extra trusted renderers before a brand becomes active", () => {
    const missing = { ...commerceAuthoringRenderers } as Record<string, unknown>;
    delete missing[COMMERCE_COMPONENTS.price];
    expect(createActiveStudioBrand({
      brandPackage: COMMERCE_BRAND_PACKAGE_INPUT,
      authoringRenderers: missing,
      runtimeRenderers: commerceRuntimeRenderers,
    })).toMatchObject({ ok: false, issue: { code: "MISSING_RENDERER" } });

    expect(createActiveStudioBrand({
      brandPackage: COMMERCE_BRAND_PACKAGE_INPUT,
      authoringRenderers: { ...commerceAuthoringRenderers, "support.component.leak": () => null },
      runtimeRenderers: commerceRuntimeRenderers,
    })).toMatchObject({ ok: false, issue: { code: "EXTRA_RENDERER" } });
  });
});
