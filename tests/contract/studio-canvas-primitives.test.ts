import { describe, expect, it } from "vitest";
import { importPuckDataIntoStudioDocument, studioViewToPuckData } from "../../packages/studio-puck-adapter/src/index.js";
import { componentCatalog, createStarterDocument } from "../../examples/experience-studio-demo/src/catalog.js";

describe("Studio Canvas v2 composable primitives", () => {
  it("registers independently editable layout, content, action and display primitives", () => {
    const refs = new Set(componentCatalog.components.map((component) => component.ref));
    for (const ref of [
      "airline.layout.stack",
      "airline.layout.row",
      "airline.layout.grid",
      "airline.layout.card",
      "airline.component.heading",
      "airline.component.text",
      "airline.component.button",
      "airline.component.badge",
      "airline.component.price",
      "airline.component.divider",
    ]) expect(refs.has(ref)).toBe(true);
    expect(componentCatalog.components.find((component) => component.ref === "airline.layout.card")?.slots).toEqual([{ name: "content", label: "Content" }]);
  });

  it("creates a nested editable graph instead of one opaque starter component", () => {
    const document = createStarterDocument("demo.composable-contract", "composable-canvas");
    const view = document.views[0];
    expect(view?.nodes.length).toBeGreaterThan(8);
    expect(view?.nodes.find((node) => node.id === "card")?.component).toBe("airline.layout.card");
    expect(view?.nodes.find((node) => node.id === "button")).toMatchObject({ parentId: "card", slot: "content", component: "airline.component.button" });
  });

  it("round-trips nested primitive slots through Puck without persisting Puck-only structure", () => {
    const document = createStarterDocument("demo.composable-roundtrip", "composable-canvas");
    const exported = studioViewToPuckData(document, componentCatalog, "main");
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const imported = importPuckDataIntoStudioDocument({ document, catalog: componentCatalog, viewId: "main", data: exported.value });
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.value.views[0]?.nodes.map((node) => [node.id, node.parentId, node.slot])).toEqual(document.views[0]?.nodes.map((node) => [node.id, node.parentId, node.slot]));
    expect(JSON.stringify(imported.value)).not.toMatch(/selectedItem|itemSelector|zones|appState/);
  });
});
