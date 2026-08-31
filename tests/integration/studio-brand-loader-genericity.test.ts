import {
  COMMERCE_BRAND_PACKAGE_INPUT,
  COMMERCE_COMPONENTS,
  commerceAuthoringRenderers,
  commerceRuntimeRenderers,
} from "../../examples/commerce-brand-kit/src/index.js";
import {
  AIRLINE_BRAND_PACKAGE_INPUT,
  airlineAuthoringRenderers,
  airlineRuntimeRenderers,
} from "../../examples/experience-studio-demo/src/airline-brand-package.js";
import { createActiveStudioBrand } from "../../packages/studio-brand-loader/src/index.js";
import type { ActiveStudioBrand } from "../../packages/studio-brand-loader/src/index.js";
import { createStudioWorkbenchSession } from "../../packages/studio-workbench/src/index.js";
import { describe, expect, it } from "vitest";

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
  it("loads airline and commerce from the same generic loader with isolated surfaces", () => {
    const airline = createActiveStudioBrand({
      brandPackage: AIRLINE_BRAND_PACKAGE_INPUT,
      authoringRenderers: airlineAuthoringRenderers,
      runtimeRenderers: airlineRuntimeRenderers,
    });
    const commerce = createActiveStudioBrand({
      brandPackage: COMMERCE_BRAND_PACKAGE_INPUT,
      authoringRenderers: commerceAuthoringRenderers,
      runtimeRenderers: commerceRuntimeRenderers,
    });
    expect(airline.ok).toBe(true);
    expect(commerce.ok).toBe(true);
    if (!airline.ok || !commerce.ok) return;

    expect(airline.value.package.brand.id).toBe("airline.brand");
    expect(commerce.value.package.brand.id).toBe("commerce.brand");
    expect(airline.value.templateIds).toContain("flight-results");
    expect(airline.value.templateIds).not.toContain("product-card");
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
    const airline = createActiveStudioBrand({
      brandPackage: AIRLINE_BRAND_PACKAGE_INPUT,
      authoringRenderers: airlineAuthoringRenderers,
      runtimeRenderers: airlineRuntimeRenderers,
    });
    const commerce = createActiveStudioBrand({
      brandPackage: COMMERCE_BRAND_PACKAGE_INPUT,
      authoringRenderers: commerceAuthoringRenderers,
      runtimeRenderers: commerceRuntimeRenderers,
    });
    if (!airline.ok || !commerce.ok) throw new Error("reference brands must load");

    const airlineSession = sessionFor(airline.value, "flight-results", "demo.airline.switch");
    const commerceSession = sessionFor(commerce.value, "product-card", "demo.commerce.switch");

    expect(airlineSession.componentCatalog().components.every((component) => component.ref.startsWith("airline."))).toBe(true);
    expect(commerceSession.componentCatalog().components.every((component) => component.ref.startsWith("commerce."))).toBe(true);
    expect(commerceSession.bindingSourceCatalog().sources.every((source) => source.path.startsWith("product."))).toBe(true);
    expect(commerceSession.actionAdapter().mappings.every((mapping) => mapping.actionType.startsWith("commerce."))).toBe(true);

    expect(createStudioWorkbenchSession({
      document: airlineSession.currentDocument(),
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
      authoringRenderers: { ...commerceAuthoringRenderers, "airline.component.leak": () => null },
      runtimeRenderers: commerceRuntimeRenderers,
    })).toMatchObject({ ok: false, issue: { code: "EXTRA_RENDERER" } });
  });
});
