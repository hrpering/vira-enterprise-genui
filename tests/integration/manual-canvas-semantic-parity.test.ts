import { describe, expect, it } from "vitest";
import { buildStudioExperience, defineStudioExperience } from "../../packages/studio-authoring/src/index.js";
import {
  importPuckDataIntoStudioDocument,
  studioViewToPuckData,
} from "../../packages/studio-puck-adapter/src/index.js";

const catalog = {
  version: "1",
  id: "parity.studio.components",
  brandId: "parity",
  components: [{
    ref: "parity.component.button",
    label: "Button",
    category: "actions",
    kind: "action",
    props: [],
    slots: [],
    events: [{ name: "press", label: "Press" }],
  }],
};

const context = {
  componentCatalog: catalog,
  bindingSourceCatalog: { version: "1", id: "parity.studio.data", sources: [] },
  actionAdapter: {
    version: "1",
    id: "parity.studio.actions",
    mappings: [{ event: "parity.submit", actionType: "parity.submit" }],
  },
};

describe("manual and Canvas semantic parity", () => {
  it("round-trips a manual canonical view through Puck without changing its publication", () => {
    const manual = defineStudioExperience({
      id: "parity.example",
      recipeId: "parity.example",
      entryView: "main",
      views: [{
        id: "main",
        nodes: [{ id: "submit", component: "parity.component.button", order: 0, props: {} }],
      }],
      interactions: [{
        viewId: "main",
        nodeId: "submit",
        event: "press",
        actionEvent: "parity.submit",
        routes: [{ outcome: "success", viewId: "main" }],
      }],
    });
    expect(manual.ok).toBe(true);
    if (!manual.ok) return;

    const puck = studioViewToPuckData(manual.value, catalog, "main");
    expect(puck.ok).toBe(true);
    if (!puck.ok) return;

    const imported = importPuckDataIntoStudioDocument({
      document: manual.value,
      catalog,
      viewId: "main",
      data: puck.value,
    });
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.value).toEqual(manual.value);

    const manualPublication = buildStudioExperience({ document: manual.value, ...context });
    const canvasPublication = buildStudioExperience({ document: imported.value, ...context });
    expect(manualPublication.ok).toBe(true);
    expect(canvasPublication.ok).toBe(true);
    if (!manualPublication.ok || !canvasPublication.ok) return;
    expect(canvasPublication.value).toEqual(manualPublication.value);
  });
});
