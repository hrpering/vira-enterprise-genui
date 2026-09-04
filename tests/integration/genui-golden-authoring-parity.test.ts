import { describe, expect, it } from "vitest";
import {
  COMMERCE_BRAND_PACKAGE_INPUT,
  COMMERCE_COMPONENTS,
  commercePreviewData,
} from "../../examples/commerce-brand-kit/src/index.js";
import { createRuntimeState } from "../../packages/runtime-core/src/index.js";
import {
  createViraExperienceRuntime,
  exportAuthoredStudioBundle,
  prepareAuthoredStudioPublication,
} from "../../packages/genui/src/index.js";
import { createStudioBrandPackage } from "../../packages/studio-brand/src/index.js";
import {
  importPuckDataIntoStudioDocument,
  studioViewToPuckData,
} from "../../packages/studio-puck-adapter/src/index.js";

const BRAND_ID = "commerce.brand" as const;

function referenceBrand() {
  const result = createStudioBrandPackage(COMMERCE_BRAND_PACKAGE_INPUT);
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

function runtimeState() {
  const result = createRuntimeState("commerce-golden-genui", {
    version: "1",
    id: "commerce.golden.plan",
    intent: { version: "1", namespace: "commerce.product", name: "detail" },
    state: {},
    capabilities: { required: [], available: [], future: [] },
  });
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

const runtimePermissionPolicy = {
  version: "1",
  rules: [{ subject: "action", id: "commerce.cart.add", effect: "allow" }],
} as const;

describe("GenUI golden manual/Canvas parity", () => {
  it("exposes the reference commerce experience as an editable canonical Studio template", () => {
    const brand = referenceBrand();
    expect(brand.templates.map((template) => template.id)).toEqual(["product-card"]);
    const document = brand.templates[0]!.document;
    expect(document.entryView).toBe("main");
    expect(document.views.map((view) => view.id)).toEqual(["main"]);
    expect(document.views[0]?.nodes).toHaveLength(4);
    expect(document.views[0]?.nodes.find((node) => node.id === "add")).toMatchObject({
      component: COMMERCE_COMPONENTS.addButton,
      parentId: "root",
      slot: "content",
    });
  });

  it("publishes the complete reference experience from the manual authoring surface", () => {
    const brand = referenceBrand();
    const result = prepareAuthoredStudioPublication({
      document: brand.templates[0]!.document,
      componentCatalog: brand.components,
      bindingSourceCatalog: brand.dataSources,
      actionAdapter: brand.actions,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.document.entryView).toBe("main");
    expect(result.value.manifest.componentRefs).toEqual(expect.arrayContaining(Object.values(COMMERCE_COMPONENTS)));
    expect(result.value.manifest.actionEvents).toEqual(["product.add"]);
  });

  it("round-trips the canonical view through the Puck boundary without semantic drift", () => {
    const brand = referenceBrand();
    const original = brand.templates[0]!.document;
    const exported = studioViewToPuckData(original, brand.components, "main");
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const imported = importPuckDataIntoStudioDocument({
      document: original,
      catalog: brand.components,
      viewId: "main",
      data: exported.value,
    });
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.value).toEqual(original);

    const manualBundle = exportAuthoredStudioBundle({ brandId: BRAND_ID, document: original });
    const canvasBundle = exportAuthoredStudioBundle({ brandId: BRAND_ID, document: imported.value });
    expect(manualBundle.ok).toBe(true);
    expect(canvasBundle.ok).toBe(true);
    if (!manualBundle.ok || !canvasBundle.ok) return;
    expect(canvasBundle.value).toEqual(manualBundle.value);

    const manualPublication = prepareAuthoredStudioPublication({
      document: original,
      componentCatalog: brand.components,
      bindingSourceCatalog: brand.dataSources,
      actionAdapter: brand.actions,
    });
    const canvasPublication = prepareAuthoredStudioPublication({
      document: imported.value,
      componentCatalog: brand.components,
      bindingSourceCatalog: brand.dataSources,
      actionAdapter: brand.actions,
    });
    expect(manualPublication.ok).toBe(true);
    expect(canvasPublication.ok).toBe(true);
    if (!manualPublication.ok || !canvasPublication.ok) return;
    expect(canvasPublication.value).toEqual(manualPublication.value);
  });

  it("executes the reference action through the canonical runtime and Host boundary", async () => {
    const brand = referenceBrand();
    const publication = prepareAuthoredStudioPublication({
      document: brand.templates[0]!.document,
      componentCatalog: brand.components,
      bindingSourceCatalog: brand.dataSources,
      actionAdapter: brand.actions,
    });
    expect(publication.ok).toBe(true);
    if (!publication.ok) return;

    const product = commercePreviewData();
    const actionsSeen: unknown[] = [];
    const runtime = createViraExperienceRuntime({
      publication: publication.value,
      componentCatalog: brand.components,
      bindingSourceCatalog: brand.dataSources,
      actionAdapter: brand.actions,
      runtimeState: runtimeState(),
      permissionPolicy: runtimePermissionPolicy,
      host: {
        version: "1",
        id: "commerce.golden.host",
        snapshot: () => ({
          version: "1",
          revision: 1,
          state: {},
          domain: { product },
        }),
        dispatch: async (action: unknown) => {
          actionsSeen.push(action);
          return { outcome: "success" };
        },
        subscribe: () => () => {},
      },
    });
    expect(runtime.ok).toBe(true);
    if (!runtime.ok) return;

    const currentView = runtime.value.controller.currentView();
    expect(currentView.ok).toBe(true);
    if (!currentView.ok) return;
    const addNode = currentView.value.nodes.find((node) => node.sourceNodeId === "add");
    expect(addNode).toBeDefined();
    if (!addNode) return;

    const result = await runtime.value.controller.dispatch({
      nodeId: "add",
      event: "press",
      payload: addNode.eventPayloads?.press ?? {},
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.outcome).toBe("success");
    expect(actionsSeen).toHaveLength(1);
    expect(actionsSeen[0]).toMatchObject({ type: "commerce.cart.add" });
    expect(runtime.value.controller.currentViewId()).toBe("main");

    runtime.value.dispose();
  });
});
