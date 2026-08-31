import { describe, expect, it } from "vitest";
import { buildStudioExperience } from "../../packages/studio-authoring/src/index.js";
import {
  importPuckDataIntoStudioDocument,
  studioViewToPuckData,
} from "../../packages/studio-puck-adapter/src/index.js";
import {
  actionAdapter,
  bindingSourceCatalog,
  componentCatalog,
} from "../../examples/experience-studio-demo/src/catalog-v4.js";
import { manualGoldenAirlineDocument } from "../../examples/manual-genui-demo/src/index.js";

describe("golden manual and Canvas parity", () => {
  it("round-trips every golden view through Puck and preserves the exact publication", () => {
    let canvasDocument = manualGoldenAirlineDocument;

    for (const view of manualGoldenAirlineDocument.views) {
      const puck = studioViewToPuckData(canvasDocument, componentCatalog, view.id);
      expect(puck.ok, `export ${view.id}`).toBe(true);
      if (!puck.ok) return;
      const imported = importPuckDataIntoStudioDocument({
        document: canvasDocument,
        catalog: componentCatalog,
        viewId: view.id,
        data: puck.value,
      });
      expect(imported.ok, `import ${view.id}`).toBe(true);
      if (!imported.ok) return;
      canvasDocument = imported.value;
    }

    expect(canvasDocument).toEqual(manualGoldenAirlineDocument);

    const context = { componentCatalog, bindingSourceCatalog, actionAdapter };
    const manualPublication = buildStudioExperience({ document: manualGoldenAirlineDocument, ...context });
    const canvasPublication = buildStudioExperience({ document: canvasDocument, ...context });
    expect(manualPublication.ok).toBe(true);
    expect(canvasPublication.ok).toBe(true);
    if (!manualPublication.ok || !canvasPublication.ok) return;
    expect(canvasPublication.value).toEqual(manualPublication.value);
  });
});
