import { describe, expect, it } from "vitest";
import { prepareStudioPublication } from "@vira-enterprise-genui/studio-publish";
import {
  actionAdapter,
  bindingSourceCatalog,
  componentCatalog,
} from "./catalog-v4.js";
import { createGoldenAirlineExperience } from "./golden-airline-experience.js";

describe("golden airline multi-view experience", () => {
  it("publishes the complete booking journey as one canonical Studio publication", () => {
    const document = createGoldenAirlineExperience();
    expect(document.entryView).toBe("search");
    expect(document.views.map((view) => view.id)).toEqual([
      "search",
      "results",
      "fare",
      "travellers",
      "seats",
      "baggage",
      "extras",
      "review",
      "confirmation",
    ]);

    const publication = prepareStudioPublication({
      document,
      componentCatalog,
      bindingSourceCatalog,
      actionAdapter,
    });
    expect(publication).toMatchObject({
      ok: true,
      value: { id: "demo.golden.airline.booking" },
    });
    if (!publication.ok) return;
    expect(publication.value.manifest.actionEvents).toEqual(expect.arrayContaining([
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

  it("routes every actionable booking step forward to the next canonical view", () => {
    const document = createGoldenAirlineExperience();
    const expected = ["results", "fare", "travellers", "seats", "baggage", "extras", "review", "confirmation"];
    expect(document.interactions).toHaveLength(expected.length);
    expect(document.interactions.map((interaction) => interaction.routes[0]?.viewId)).toEqual(expected);
  });
});
