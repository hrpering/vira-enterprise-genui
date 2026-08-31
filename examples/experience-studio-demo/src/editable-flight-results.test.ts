import { AIRLINE_STUDIO_COMPONENTS } from "@vira-enterprise-genui/airline-brand-kit";
import {
  DEFAULT_MOCK_RUNTIME_INPUT,
  createMockAirlineRuntimeData,
} from "@vira-enterprise-genui/mock-airline-domain";
import { createRuntimeState } from "@vira-enterprise-genui/runtime-core";
import { prepareStudioPublication } from "@vira-enterprise-genui/studio-publish";
import { createStudioRuntimeSession } from "@vira-enterprise-genui/studio-runtime";
import { describe, expect, it } from "vitest";
import {
  actionAdapter,
  bindingSourceCatalog,
  componentCatalog,
  createStarterDocument,
  runtimePermissionPolicy,
} from "./catalog.js";

function runtimeState() {
  const result = createRuntimeState("editable-flight-results", {
    version: "1",
    id: "editable-flight-results-plan",
    intent: { version: "1", namespace: "travel.flight", name: "results" },
    state: {},
    capabilities: { required: [], available: [], future: [] },
  });
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

describe("editable Flight Results starter", () => {
  it("authors one repeated card template instead of one opaque Flight Results island", () => {
    const document = createStarterDocument("demo.editable-flight-results", "flight-results");
    const nodes = document.views[0]?.nodes ?? [];
    expect(nodes.length).toBeGreaterThan(6);
    expect(nodes.some((node) => node.component === AIRLINE_STUDIO_COMPONENTS.flightResults)).toBe(false);

    const repeated = nodes.filter((node) => node.repeat !== undefined);
    expect(repeated).toHaveLength(1);
    expect(repeated[0]).toMatchObject({
      id: "offer-card",
      component: "airline.layout.card",
      repeat: { source: { kind: "domain", path: "results.offers" } },
    });

    expect(document.bindings.some((binding) => binding.source.kind === "scope" && binding.source.path === "currentItem.price")).toBe(true);
    expect(document.interactions).toEqual([expect.objectContaining({
      nodeId: "choose",
      event: "press",
      actionEvent: "flight.offer.select",
      payloadBindings: [{ key: "offerId", source: { kind: "scope", path: "currentItem.id" } }],
    })]);
  });

  it("publishes one authored offer card and renders the three deterministic default offers", () => {
    const document = createStarterDocument("demo.editable-flight-results", "flight-results");
    const publication = prepareStudioPublication({
      document,
      componentCatalog,
      bindingSourceCatalog,
      actionAdapter,
    });
    expect(publication.ok).toBe(true);
    if (!publication.ok) return;

    const runtimeData = createMockAirlineRuntimeData(DEFAULT_MOCK_RUNTIME_INPUT);
    let sequence = 0;
    const session = createStudioRuntimeSession({
      publication: publication.value,
      componentCatalog,
      bindingSourceCatalog,
      actionAdapter,
      runtimeState: runtimeState(),
      permissionPolicy: runtimePermissionPolicy,
    }, {
      data: {
        read(source) {
          return source.kind === "domain" ? runtimeData[source.path] : undefined;
        },
      },
      actionIds: { nextId: () => `editable-offer-action-${++sequence}` },
    });
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const view = session.value.currentView();
    expect(view.ok).toBe(true);
    if (!view.ok) return;

    const cards = view.value.nodes.filter((node) => node.sourceNodeId === "offer-card");
    const buttons = view.value.nodes.filter((node) => node.sourceNodeId === "choose");
    expect(cards).toHaveLength(3);
    expect(buttons).toHaveLength(3);
    expect(buttons.map((node) => node.eventPayloads.press?.offerId)).toEqual([
      "vx-979-260915-1",
      "vx-977-260915-2",
      "vx-981-260915-3",
    ]);

    expect(document.views[0]?.nodes.filter((node) => node.id === "offer-card")).toHaveLength(1);
  });
});
