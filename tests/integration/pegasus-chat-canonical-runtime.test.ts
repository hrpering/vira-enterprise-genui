import { describe, expect, it } from "vitest";
import { SEAT_OPTIONS } from "../../examples/airline-brand-kit/src/index.js";
import {
  applyCanonicalViraCommand,
  registerCanonicalChatCommandTarget,
} from "../../examples/pegasus-chat-demo/components/canonical-chat-command.js";
import { createCanonicalChatRuntime } from "../../examples/pegasus-chat-demo/components/canonical-chat-runtime.js";
import type { ViraFlightExperienceResult } from "../../examples/pegasus-chat-demo/lib/vira-chat-contract.js";
import { searchFlights } from "../../examples/mock-airline-domain/src/index.js";

function resultFor(date = "2026-09-03"): ViraFlightExperienceResult {
  const search = searchFlights({ origin: "SAW", destination: "BER", departureDate: date, passengers: 2 });
  return {
    version: "1",
    kind: "vira.experience",
    experience: "travel.flight.search",
    input: {
      origin: search.origin,
      destination: search.destination,
      departureDate: search.departureDate,
      passengers: search.passengers,
    },
    data: { offers: search.offers },
  };
}

function currentProps(bundle: NonNullable<ReturnType<typeof createCanonicalChatRuntime>>) {
  const current = bundle.runtime.controller.currentView();
  expect(current.ok).toBe(true);
  if (!current.ok) throw new Error(current.issue.message);
  const root = current.value.nodes[0];
  if (!root) throw new Error("canonical Chat view must include a root node");
  return root.props;
}

describe("Pegasus Chat canonical Studio runtime", () => {
  it("carries search, selected offer, fare and assistant commands through the canonical host boundary", async () => {
    const bundle = createCanonicalChatRuntime(resultFor());
    expect(bundle).toBeDefined();
    if (!bundle) return;

    expect(bundle.runtime.controller.currentViewId()).toBe("flight-search");

    const searched = await bundle.runtime.controller.dispatch({
      nodeId: "flight-search-root",
      event: "submit",
      payload: {
        origin: "SAW",
        destination: "BER",
        departureDate: "2026-10-20",
        passengers: 2,
      },
    });
    expect(searched.ok).toBe(true);
    expect(bundle.runtime.controller.currentViewId()).toBe("flight-results");
    expect(currentProps(bundle)).toMatchObject({
      origin: "SAW",
      destination: "BER",
      departure: "2026-10-20",
      passengers: 2,
    });

    const offers = bundle.offers();
    const selected = offers[1] ?? offers[0];
    if (!selected) throw new Error("canonical Chat search must return an offer");
    const offerResult = await bundle.runtime.controller.dispatch({
      nodeId: "flight-results-root",
      event: "select",
      payload: { offerId: selected.id },
    });
    expect(offerResult.ok).toBe(true);
    expect(bundle.runtime.controller.currentViewId()).toBe("fare-comparison");
    expect(currentProps(bundle)).toMatchObject({
      "base-price": selected.price,
      currency: selected.currency,
      passengers: 2,
    });

    const fareResult = await bundle.runtime.controller.dispatch({
      nodeId: "fare-comparison-root",
      event: "select",
      payload: { fareId: "flex" },
    });
    expect(fareResult.ok).toBe(true);
    expect(bundle.runtime.controller.currentViewId()).toBe("traveller-details");

    await bundle.runtime.controller.dispatch({
      nodeId: "traveller-details-root",
      event: "submit",
      payload: {
        passengers: [
          { firstName: "Alex", lastName: "One", birthDate: "1990-01-01" },
          { firstName: "Sam", lastName: "Two", birthDate: "1992-02-02" },
        ],
        contact: { email: "alex@example.test", phone: "+900000000" },
      },
    });
    expect(bundle.runtime.controller.currentViewId()).toBe("seat-selection");
    expect(currentProps(bundle)).toMatchObject({ passengers: 2, fare: "flex" });

    const seat = SEAT_OPTIONS.find((candidate) => candidate.occupied !== true);
    if (!seat) throw new Error("airline fixture must include an available seat");
    await bundle.runtime.controller.dispatch({
      nodeId: "seat-selection-root",
      event: "select",
      payload: { passengerIndex: 0, seat: seat.id },
    });
    expect(bundle.runtime.controller.currentViewId()).toBe("baggage");

    await bundle.runtime.controller.dispatch({
      nodeId: "baggage-root",
      event: "select",
      payload: { applyToAll: true, optionId: "20kg" },
    });
    expect(bundle.runtime.controller.currentViewId()).toBe("extras");

    const unregister = registerCanonicalChatCommandTarget({
      runtime: bundle.runtime,
      offers: bundle.offers,
    });
    try {
      await expect(applyCanonicalViraCommand({
        version: "1",
        kind: "vira.command",
        command: "set-insurance",
        value: "flex-plus",
      })).resolves.toEqual({ ok: true });
      expect(bundle.runtime.controller.currentViewId()).toBe("extras");

      await expect(applyCanonicalViraCommand({
        version: "1",
        kind: "vira.command",
        command: "add-extra",
        value: "meal",
      })).resolves.toEqual({ ok: true });
      expect(bundle.runtime.controller.currentViewId()).toBe("extras");

      const extrasResult = await bundle.runtime.controller.dispatch({
        nodeId: "extras-root",
        event: "submit",
        payload: { insuranceId: "flex-plus", extras: ["meal"] },
      });
      expect(extrasResult.ok).toBe(true);
      expect(bundle.runtime.controller.currentViewId()).toBe("booking-review");
      expect(currentProps(bundle)).toMatchObject({
        origin: "SAW",
        destination: "BER",
        passengers: 2,
        fare: "flex",
        "base-price": selected.price,
        currency: selected.currency,
      });

      await expect(applyCanonicalViraCommand({
        version: "1",
        kind: "vira.command",
        command: "add-extra",
        value: "fast-track",
      })).resolves.toEqual({ ok: true });
      expect(bundle.runtime.controller.currentViewId()).toBe("booking-review");
    } finally {
      unregister();
    }

    const handoff = await bundle.runtime.controller.dispatch({
      nodeId: "booking-review-root",
      event: "continue",
      payload: {},
    });
    expect(handoff.ok).toBe(true);
    expect(bundle.runtime.controller.currentViewId()).toBe("confirmation");

    bundle.runtime.dispose();
  });
});
