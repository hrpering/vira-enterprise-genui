import { describe, expect, it } from "vitest";
import { createRuntimeState } from "../../packages/runtime-core/src/index.js";
import {
  createViraExperienceRuntime,
  exportAuthoredStudioBundle,
  prepareAuthoredStudioPublication,
} from "../../packages/genui/src/index.js";
import {
  importPuckDataIntoStudioDocument,
  studioViewToPuckData,
} from "../../packages/studio-puck-adapter/src/index.js";
import { createMockAirlineStudioCollectionData } from "../../examples/mock-airline-domain/src/studio-collections.js";
import {
  actionAdapter,
  bindingSourceCatalog,
  componentCatalog,
  createStarterDocument,
  runtimePermissionPolicy,
  starterTemplates,
} from "../../examples/experience-studio-demo/src/catalog.js";
import {
  GOLDEN_AIRLINE_BOOKING_STEPS,
  createGoldenAirlineExperience,
} from "../../examples/experience-studio-demo/src/golden-airline-experience.js";

const BRAND_ID = "airline.brand" as const;

function runtimeState() {
  const result = createRuntimeState("golden-airline-genui", {
    version: "1",
    id: "golden-airline-genui-plan",
    intent: { version: "1", namespace: "travel.flight", name: "booking" },
    state: {},
    capabilities: { required: [], available: [], future: [] },
  });
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

describe("GenUI golden manual/Canvas parity", () => {
  it("exposes the full booking journey as an editable Studio starter", () => {
    expect(starterTemplates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "booking-journey",
        label: "Full booking journey",
      }),
    ]));
    const document = createStarterDocument("airline.gallery.booking-journey", "booking-journey");
    expect(document.views.map((view) => view.id)).toEqual(GOLDEN_AIRLINE_BOOKING_STEPS);
    expect(document.entryView).toBe("flight-search");
  });

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

  it("executes every golden booking step through the canonical runtime and host boundary", async () => {
    const publication = prepareAuthoredStudioPublication({
      document: createGoldenAirlineExperience(),
      componentCatalog,
      bindingSourceCatalog,
      actionAdapter,
    });
    expect(publication.ok).toBe(true);
    if (!publication.ok) return;

    const collectionData = createMockAirlineStudioCollectionData();
    const offers = collectionData["results.offers"];
    expect(Array.isArray(offers)).toBe(true);

    const actionsSeen: unknown[] = [];
    const runtime = createViraExperienceRuntime({
      publication: publication.value,
      componentCatalog,
      bindingSourceCatalog,
      actionAdapter,
      runtimeState: runtimeState(),
      permissionPolicy: runtimePermissionPolicy,
      host: {
        version: "1",
        id: "golden-airline-host",
        snapshot: () => ({
          version: "1",
          revision: 1,
          state: {},
          domain: { results: { offers } },
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

    for (let index = 0; index < GOLDEN_AIRLINE_BOOKING_STEPS.length - 1; index += 1) {
      const viewId = GOLDEN_AIRLINE_BOOKING_STEPS[index];
      const nextViewId = GOLDEN_AIRLINE_BOOKING_STEPS[index + 1];
      expect(runtime.value.controller.currentViewId()).toBe(viewId);

      const interaction = publication.value.document.interactions.find((candidate) => candidate.viewId === viewId);
      expect(interaction).toBeDefined();
      if (!interaction) break;

      const currentView = runtime.value.controller.currentView();
      expect(currentView.ok).toBe(true);
      if (!currentView.ok) break;
      const runtimeNode = currentView.value.nodes.find((node) => node.sourceNodeId === interaction.nodeId);
      expect(runtimeNode).toBeDefined();
      if (!runtimeNode) break;
      const payload = runtimeNode.eventPayloads?.[interaction.event] ?? {};

      const result = await runtime.value.controller.dispatch({
        nodeId: interaction.nodeId,
        event: interaction.event,
        payload,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) break;
      expect(result.value.outcome).toBe("success");
      expect(runtime.value.controller.currentViewId()).toBe(nextViewId);
    }

    expect(runtime.value.controller.currentViewId()).toBe("confirmation");
    expect(actionsSeen).toHaveLength(GOLDEN_AIRLINE_BOOKING_STEPS.length - 1);
    expect(actionsSeen).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "travel.flight.search.submit" }),
      expect.objectContaining({ type: "travel.flight.offer.select", payload: expect.objectContaining({ offerId: expect.any(String) }) }),
      expect.objectContaining({ type: "travel.flight.booking.handoff" }),
    ]));

    runtime.value.dispose();
  });
});
