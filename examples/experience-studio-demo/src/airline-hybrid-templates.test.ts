import { AIRLINE_STUDIO_COMPONENTS } from "@vira-enterprise-genui/airline-brand-kit";
import { describe, expect, it } from "vitest";
import {
  HYBRID_AIRLINE_TEMPLATE_IDS,
} from "./airline-hybrid-templates.js";
import { createStarterDocument } from "./catalog.js";
import { applyMockDomainBindings } from "./mock-bindings.js";

const expectedComponents = Object.freeze({
  "flight-search": AIRLINE_STUDIO_COMPONENTS.flightSearch,
  "fare-comparison": AIRLINE_STUDIO_COMPONENTS.fareComparison,
  "traveller-details": AIRLINE_STUDIO_COMPONENTS.travellerDetails,
  "seat-selection": AIRLINE_STUDIO_COMPONENTS.seatMap,
  baggage: AIRLINE_STUDIO_COMPONENTS.baggageSelector,
  extras: AIRLINE_STUDIO_COMPONENTS.extrasSelector,
  "booking-review": AIRLINE_STUDIO_COMPONENTS.bookingReview,
});

describe("hybrid airline starter decomposition", () => {
  it("wraps every locked functional booking widget in editable Studio nodes", () => {
    for (const template of HYBRID_AIRLINE_TEMPLATE_IDS) {
      const document = createStarterDocument(`demo.${template}`, template);
      const nodes = document.views[0]?.nodes ?? [];
      const functional = nodes.filter((node) => node.component === expectedComponents[template]);

      expect(nodes.length, template).toBeGreaterThan(4);
      expect(nodes.some((node) => node.component === "airline.component.heading"), template).toBe(true);
      expect(nodes.some((node) => node.component === "airline.component.text"), template).toBe(true);
      expect(functional, template).toHaveLength(1);
      expect(functional[0]?.parentId, template).toBe("widget-shell");
      expect(document.interactions, template).toHaveLength(1);
      expect(document.interactions[0]?.nodeId, template).toBe("widget");
    }
  });

  it("converts functional widget defaults to mock-domain bindings without changing the editable wrapper graph", () => {
    const source = createStarterDocument("demo.seat-selection", "seat-selection");
    const sourceNodes = source.views[0]?.nodes.length ?? 0;
    const bound = applyMockDomainBindings(source);
    const widget = bound.views[0]?.nodes.find((node) => node.id === "widget");

    expect(bound.views[0]?.nodes).toHaveLength(sourceNodes);
    expect(widget?.component).toBe(AIRLINE_STUDIO_COMPONENTS.seatMap);
    expect(widget?.props).not.toHaveProperty("passengers");
    expect(widget?.props).not.toHaveProperty("fare");
    expect(bound.bindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ nodeId: "widget", prop: "passengers", source: { kind: "domain", path: "booking.passengers" } }),
      expect.objectContaining({ nodeId: "widget", prop: "fare", source: { kind: "domain", path: "booking.fare" } }),
    ]));
  });
});
