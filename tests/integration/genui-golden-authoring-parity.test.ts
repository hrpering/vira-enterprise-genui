import { describe, expect, it } from "vitest";
import {
  exportAuthoredStudioBundle,
  prepareAuthoredStudioPublication,
} from "../../packages/studio-authoring/src/index.js";
import {
  importPuckDataIntoStudioDocument,
  studioViewToPuckData,
} from "../../packages/studio-puck-adapter/src/index.js";
import {
  actionAdapter,
  bindingSourceCatalog,
  componentCatalog,
} from "../../examples/experience-studio-demo/src/catalog.js";
import {
  GOLDEN_AIRLINE_BOOKING_STEPS,
  createGoldenAirlineExperience,
} from "../../examples/experience-studio-demo/src/golden-airline-experience.js";

const BRAND_ID = "airline.brand" as const;

describe("GenUI golden manual/Canvas parity", () => {
  it("publishes the complete booking journey from the manual authoring surface", () => {
    const document = createGoldenAirlineExperience();
    expect(document.views.map((view) => view.id)).toEqual(GOLDEN_AIRLINE_BOOKING_STEPS);

    const result = prepareAuthoredStudioPublication({
      document,
      componentCatalog,
      bindingSourceCatalog,
      actionAdapter,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.document.entryView).toBe("flight-search");
    expect(result.value.document.views.at(-1)?.id).toBe("confirmation");
    expect(result.value.manifest.componentRefs).toContain("airline.status.progress");
    expect(result.value.manifest.actionEvents).toEqual(expect.arrayContaining([
      "flight.search.submit",
      "flight.offer.select",
      "flight.fare.select",
      "flight.passenger.submit",
      "flight.seat.select",
      "flight.baggage.select",
      "flight.extras.submit",
      "flight.booking.handoff",
    ]));
  });

  it("round-trips every golden view through the Puck boundary without semantic drift", () => {
    const original = createGoldenAirlineExperience();
    let canvasDocument = original;

    for (const view of original.views) {
      const exported = studioViewToPuckData(canvasDocument, componentCatalog, view.id);
      expect(exported.ok).toBe(true);
      if (!exported.ok) return;
      const imported = importPuckDataIntoStudioDocument({
        document: canvasDocument,
        catalog: componentCatalog,
        viewId: view.id,
        data: exported.value,
      });
      expect(imported.ok).toBe(true);
      if (!imported.ok) return;
      canvasDocument = imported.value;
    }

    expect(canvasDocument).toEqual(original);

    const manualBundle = exportAuthoredStudioBundle({ brandId: BRAND_ID, document: original });
    const canvasBundle = exportAuthoredStudioBundle({ brandId: BRAND_ID, document: canvasDocument });
    expect(manualBundle.ok).toBe(true);
    expect(canvasBundle.ok).toBe(true);
    if (!manualBundle.ok || !canvasBundle.ok) return;
    expect(canvasBundle.value).toEqual(manualBundle.value);

    const manualPublication = prepareAuthoredStudioPublication({
      document: original,
      componentCatalog,
      bindingSourceCatalog,
      actionAdapter,
    });
    const canvasPublication = prepareAuthoredStudioPublication({
      document: canvasDocument,
      componentCatalog,
      bindingSourceCatalog,
      actionAdapter,
    });
    expect(manualPublication.ok).toBe(true);
    expect(canvasPublication.ok).toBe(true);
    if (!manualPublication.ok || !canvasPublication.ok) return;
    expect(canvasPublication.value).toEqual(manualPublication.value);
  });
});
