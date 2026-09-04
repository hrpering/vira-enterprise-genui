import { describe, expect, it } from "vitest";
import { COMMERCE_BRAND_PACKAGE_INPUT, COMMERCE_COMPONENTS } from "../../examples/commerce-brand-kit/src/index.js";
import { createStudioBrandPackage } from "../../packages/studio-brand/src/index.js";
import { importPuckDataIntoStudioDocument, studioViewToPuckData } from "../../packages/studio-puck-adapter/src/index.js";

function referenceBrand() {
  const result = createStudioBrandPackage(COMMERCE_BRAND_PACKAGE_INPUT);
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

describe("Studio Canvas v2 composable primitives", () => {
  it("registers independently editable layout, content and action primitives", () => {
    const brand = referenceBrand();
    const refs = new Set(brand.components.components.map((component) => component.ref));
    for (const ref of [
      COMMERCE_COMPONENTS.stack,
      COMMERCE_COMPONENTS.title,
      COMMERCE_COMPONENTS.price,
      COMMERCE_COMPONENTS.addButton,
    ]) expect(refs.has(ref)).toBe(true);
    expect(brand.components.components.find((component) => component.ref === COMMERCE_COMPONENTS.stack)?.slots).toEqual([{ name: "content", label: "Content" }]);
  });

  it("keeps a nested editable graph instead of one opaque starter component", () => {
    const document = referenceBrand().templates[0]!.document;
    const view = document.views[0];
    expect(view?.nodes).toHaveLength(4);
    expect(view?.nodes.find((node) => node.id === "root")?.component).toBe(COMMERCE_COMPONENTS.stack);
    expect(view?.nodes.find((node) => node.id === "add")).toMatchObject({ parentId: "root", slot: "content", component: COMMERCE_COMPONENTS.addButton });
  });

  it("round-trips nested primitive slots through Puck without persisting Puck-only structure", () => {
    const brand = referenceBrand();
    const document = brand.templates[0]!.document;
    const exported = studioViewToPuckData(document, brand.components, "main");
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const imported = importPuckDataIntoStudioDocument({ document, catalog: brand.components, viewId: "main", data: exported.value });
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.value.views[0]?.nodes.map((node) => [node.id, node.parentId, node.slot])).toEqual(document.views[0]?.nodes.map((node) => [node.id, node.parentId, node.slot]));
    expect(JSON.stringify(imported.value)).not.toMatch(/selectedItem|itemSelector|zones|appState/);
  });
});
