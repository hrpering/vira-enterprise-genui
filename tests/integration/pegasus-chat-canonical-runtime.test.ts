import { describe, expect, it } from "vitest";
import { SEAT_OPTIONS } from "../../examples/airline-brand-kit/src/index.js";
import {
  FLIGHT_BOOKING_ENTRYPOINT,
  FLIGHT_BOOKING_PACK_ID,
  FLIGHT_BOOKING_PACK_VERSION,
} from "../../examples/airline-brand-kit/src/chat-publication.js";
import { createDemoChatBridge } from "../../examples/pegasus-chat-demo/lib/demo-genui.js";
import { searchFlights } from "../../examples/mock-airline-domain/src/index.js";
import type { ViraResolvedExperience } from "../../packages/genui-resolver/src/index.js";

function presentMessage(instanceId: string, date = "2026-09-03") {
  const search = searchFlights({ origin: "SAW", destination: "BER", departureDate: date, passengers: 2 });
  return {
    version: "1" as const,
    op: "present" as const,
    instanceId,
    pack: {
      id: FLIGHT_BOOKING_PACK_ID,
      version: FLIGHT_BOOKING_PACK_VERSION,
      entrypoint: FLIGHT_BOOKING_ENTRYPOINT,
    },
    payload: {
      input: {
        origin: search.origin,
        destination: search.destination,
        departureDate: search.departureDate,
        passengers: search.passengers,
      },
      data: { offers: search.offers },
    },
  };
}

function currentProps(runtime: ViraResolvedExperience["runtime"]) {
  const current = runtime.controller.currentView();
  expect(current.ok).toBe(true);
  if (!current.ok) throw new Error(current.issue.message);
  const root = current.value.nodes[0];
  if (!root) throw new Error("Flight Pack view must include a root node");
  return root.props;
}

function command(instanceId: string, name: string, value?: string) {
  return {
    version: "1" as const,
    op: "command" as const,
    instanceId,
    command: name,
    args: value === undefined ? {} : { value },
  };
}

describe("Pegasus Chat Flight Experience Pack runtime", () => {
  it("carries the complete booking journey through the generic exact-instance bridge", async () => {
    const instanceId = "flight-full-journey";
    const bridge = createDemoChatBridge();
    const presented = await bridge.present(presentMessage(instanceId));
    expect(presented.ok).toBe(true);
    if (!presented.ok) return;
    const runtime = presented.value.runtime;

    expect(runtime.controller.currentViewId()).toBe("flight-search");

    const searched = await runtime.controller.dispatch({
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
    expect(runtime.controller.currentViewId()).toBe("flight-results");
    expect(currentProps(runtime)).toMatchObject({
      origin: "SAW",
      destination: "BER",
      departure: "2026-10-20",
      passengers: 2,
    });

    const refreshed = searchFlights({ origin: "SAW", destination: "BER", departureDate: "2026-10-20", passengers: 2 });
    const selected = refreshed.offers[1] ?? refreshed.offers[0];
    if (!selected) throw new Error("Flight fixture must include an offer");
    const offerResult = await runtime.controller.dispatch({
      nodeId: "flight-results-root",
      event: "select",
      payload: { offerId: selected.id },
    });
    expect(offerResult.ok).toBe(true);
    expect(runtime.controller.currentViewId()).toBe("fare-comparison");
    expect(currentProps(runtime)).toMatchObject({
      "base-price": selected.price,
      currency: selected.currency,
      passengers: 2,
    });

    const fareResult = await runtime.controller.dispatch({
      nodeId: "fare-comparison-root",
      event: "select",
      payload: { fareId: "flex" },
    });
    expect(fareResult.ok).toBe(true);
    expect(runtime.controller.currentViewId()).toBe("traveller-details");

    const travellers = await runtime.controller.dispatch({
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
    expect(travellers.ok).toBe(true);
    expect(runtime.controller.currentViewId()).toBe("seat-selection");
    expect(currentProps(runtime)).toMatchObject({ passengers: 2, fare: "flex" });

    const availableSeats = SEAT_OPTIONS.filter((candidate) => candidate.occupied !== true).slice(0, 2);
    const firstSeat = availableSeats[0];
    const secondSeat = availableSeats[1];
    if (!firstSeat || !secondSeat) throw new Error("Airline fixture must include two available seats");

    const partialSeat = await runtime.controller.dispatch({
      nodeId: "seat-selection-root",
      event: "select",
      payload: { passengerIndex: 0, seat: firstSeat.id },
    });
    expect(partialSeat).toMatchObject({ ok: true, value: { outcome: "empty" } });
    expect(runtime.controller.currentViewId()).toBe("seat-selection");

    const finalSeat = await runtime.controller.dispatch({
      nodeId: "seat-selection-root",
      event: "select",
      payload: { passengerIndex: 1, seat: secondSeat.id },
    });
    expect(finalSeat).toMatchObject({ ok: true, value: { outcome: "success" } });
    expect(runtime.controller.currentViewId()).toBe("baggage");

    const baggage = await runtime.controller.dispatch({
      nodeId: "baggage-root",
      event: "select",
      payload: { applyToAll: true, optionId: "20kg" },
    });
    expect(baggage).toMatchObject({ ok: true, value: { outcome: "success" } });
    expect(runtime.controller.currentViewId()).toBe("extras");

    await expect(bridge.command(command(instanceId, "set-insurance", "flex-plus"))).resolves.toEqual({ ok: true });
    expect(runtime.controller.currentViewId()).toBe("extras");
    expect(currentProps(runtime)).toMatchObject({ "insurance-id": "flex-plus" });

    await expect(bridge.command(command(instanceId, "add-extra", "meal"))).resolves.toEqual({ ok: true });
    expect(currentProps(runtime)).toMatchObject({ "selected-extras": "meal" });

    const extrasResult = await runtime.controller.dispatch({
      nodeId: "extras-root",
      event: "submit",
      payload: { insuranceId: "flex-plus", extras: ["meal"] },
    });
    expect(extrasResult.ok).toBe(true);
    expect(runtime.controller.currentViewId()).toBe("booking-review");
    const review = currentProps(runtime);
    expect(review).toMatchObject({
      origin: "SAW",
      destination: "BER",
      passengers: 2,
      fare: "flex",
      "base-price": selected.price,
      currency: selected.currency,
      "flight-number": selected.flightNumber,
    });
    expect(String(review["seat-summary"])).toContain(firstSeat.id);
    expect(String(review["seat-summary"])).toContain(secondSeat.id);
    expect(String(review["baggage-summary"])).toContain("P1:");
    expect(String(review["insurance-label"])).not.toBe("None");
    expect(String(review["extras-summary"])).toContain("Meal");
    expect(typeof review.total).toBe("number");
    expect(Number(review.total)).toBeGreaterThan(selected.price);

    await expect(bridge.command(command(instanceId, "add-extra", "fast-track"))).resolves.toEqual({ ok: true });
    expect(runtime.controller.currentViewId()).toBe("booking-review");
    expect(String(currentProps(runtime)["extras-summary"])).toContain("Fast");

    const handoff = await runtime.controller.dispatch({
      nodeId: "booking-review-root",
      event: "continue",
      payload: {},
    });
    expect(handoff.ok).toBe(true);
    expect(runtime.controller.currentViewId()).toBe("confirmation");
    expect(currentProps(runtime)).toMatchObject({
      "flight-number": selected.flightNumber,
      fare: "flex",
    });

    bridge.dispose();
  });
});
