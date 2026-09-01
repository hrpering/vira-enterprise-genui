import {
  SEAT_OPTIONS,
  baggageById,
  baggageFeeForFare,
  extraById,
  extraFeeForFare,
  fareById,
  insuranceById,
  seatById,
  seatFeeForFare,
} from "@vira-enterprise-genui/airline-brand-kit";
import {
  FLIGHT_BOOKING_ACTION_ADAPTER,
  FLIGHT_BOOKING_BINDING_SOURCE_CATALOG,
  FLIGHT_BOOKING_COMPONENT_CATALOG,
  FLIGHT_BOOKING_PERMISSION_POLICY,
  FLIGHT_BOOKING_PUBLICATION,
} from "@vira-enterprise-genui/airline-brand-kit/chat-publication";
import type {
  ViraCommandAdapter,
  ViraCommandAdapterResult,
  ViraRuntimeCapabilityProfile,
  ViraRuntimeProfileContext,
  ViraRuntimeProfilePreparation,
} from "@vira-enterprise-genui/genui-resolver";
import {
  searchFlights,
  type MockFlightOffer,
} from "@vira-enterprise-genui/mock-airline-domain";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import { createRuntimeState } from "@vira-enterprise-genui/runtime-core";
import { CANONICAL_CHAT_RENDERERS } from "./canonical-chat-renderers.js";

interface FlightPayload {
  readonly input: {
    readonly origin: string;
    readonly destination: string;
    readonly departureDate: string;
    readonly passengers: number;
  };
  readonly offers: readonly MockFlightOffer[];
}

function object(value: JsonValue | undefined): JsonObject | undefined {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function text(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function integer(value: JsonValue | undefined, minimum: number, maximum: number): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum
    ? value
    : undefined;
}

function offer(value: JsonValue | undefined): MockFlightOffer | undefined {
  const item = object(value);
  if (!item) return undefined;
  const id = text(item.id);
  const carrier = text(item.carrier);
  const flightNumber = text(item.flightNumber);
  const origin = text(item.origin);
  const destination = text(item.destination);
  const departure = text(item.departure);
  const arrival = text(item.arrival);
  const duration = text(item.duration);
  const currency = text(item.currency);
  const price = typeof item.price === "number" && Number.isFinite(item.price) && item.price >= 0 ? item.price : undefined;
  const remainingSeats = integer(item.remainingSeats, 0, 10_000);
  if (!id || !carrier || !flightNumber || !origin || !destination || !departure || !arrival || !duration || !currency
    || price === undefined || remainingSeats === undefined) return undefined;
  return Object.freeze({
    id,
    carrier,
    flightNumber,
    origin,
    destination,
    departure,
    arrival,
    duration,
    price,
    currency,
    remainingSeats,
  });
}

function payload(value: JsonObject): FlightPayload | undefined {
  const input = object(value.input);
  const data = object(value.data);
  const offers = data?.offers;
  if (!input || !Array.isArray(offers)) return undefined;
  const origin = text(input.origin);
  const destination = text(input.destination);
  const departureDate = text(input.departureDate);
  const passengers = integer(input.passengers, 1, 8);
  if (!origin || !destination || !departureDate || passengers === undefined) return undefined;
  const parsedOffers: MockFlightOffer[] = [];
  for (const value of offers) {
    const parsed = offer(value);
    if (!parsed) return undefined;
    parsedOffers.push(parsed);
  }
  if (parsedOffers.length === 0) return undefined;
  return Object.freeze({
    input: Object.freeze({ origin, destination, departureDate, passengers }),
    offers: Object.freeze(parsedOffers),
  });
}

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    if (Object.getOwnPropertySymbols(value).length > 0
      || Object.getOwnPropertyNames(value).length !== Object.keys(value).length) return undefined;
    const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) return undefined;
      output[key] = descriptor.value;
    }
    return output;
  } catch {
    return undefined;
  }
}

function requiredText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function passengerIndex(value: unknown, passengers: number): number | undefined {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 0
    && value < passengers
    ? value
    : undefined;
}

function commandFailure(code: string, message: string, path = "$.args"): ViraCommandAdapterResult {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function commandSuccess(): ViraCommandAdapterResult {
  return { ok: true };
}

function runtimeState() {
  const result = createRuntimeState("airline-flight-booking", {
    version: "1",
    id: "airline-flight-booking-plan",
    intent: { version: "1", namespace: "travel.flight", name: "search" },
    state: {},
    capabilities: { required: [], available: [], future: [] },
  });
  if (!result.ok) throw new Error("flight runtime state could not be created");
  return result.value;
}

function prepareFlightRuntime(value: JsonObject): ViraRuntimeProfilePreparation {
  const parsed = payload(value);
  if (!parsed) throw new Error("flight booking payload is invalid");

  let revision = 1;
  let searchInput = { ...parsed.input };
  let offers: readonly MockFlightOffer[] = [...parsed.offers];
  let selectedOfferId: string | undefined;
  let selectedFare = "smart";
  let selectedInsurance = "none";
  let passengerDetails: readonly Readonly<Record<string, string>>[] = [];
  let bookingContact: Readonly<Record<string, string>> | undefined;
  const seatSelections = new Map<number, string>();
  const baggageSelections = new Map<number, string>();
  const selectedExtras = new Set<string>();

  const selectedOffer = (): MockFlightOffer | undefined =>
    offers.find((candidate) => candidate.id === selectedOfferId) ?? offers[0];

  const resetDownstream = (): void => {
    passengerDetails = [];
    bookingContact = undefined;
    seatSelections.clear();
    baggageSelections.clear();
    selectedInsurance = "none";
    selectedExtras.clear();
  };

  const fareTotal = (): number => {
    const current = selectedOffer();
    const fare = fareById(selectedFare);
    return (current?.price ?? 0) + (fare?.perPassengerExtra ?? 0) * searchInput.passengers;
  };

  const seatTotal = (): number => [...seatSelections.values()].reduce((sum, seatId) => {
    const seat = seatById(seatId);
    return sum + (seat ? seatFeeForFare(seat, selectedFare) : 0);
  }, 0);

  const baggageTotal = (): number => [...baggageSelections.values()].reduce((sum, optionId) => {
    const baggage = baggageById(optionId);
    return sum + (baggage ? baggageFeeForFare(baggage, selectedFare) : 0);
  }, 0);

  const insuranceTotal = (): number => {
    const insurance = insuranceById(selectedInsurance);
    return (insurance?.feePerPassenger ?? 0) * searchInput.passengers;
  };

  const extrasTotal = (): number => [...selectedExtras].reduce((sum, id) => {
    const extra = extraById(id);
    return sum + (extra ? extraFeeForFare(extra, selectedFare) * searchInput.passengers : 0);
  }, 0);

  const total = (): number => Math.round((fareTotal() + seatTotal() + baggageTotal() + insuranceTotal() + extrasTotal()) * 100) / 100;

  const seatSummary = (): string => Array.from({ length: searchInput.passengers }, (_, index) =>
    `P${index + 1}: ${seatSelections.get(index) ?? "—"}`).join(" · ");

  const baggageSummary = (): string => Array.from({ length: searchInput.passengers }, (_, index) => {
    const baggage = baggageById(baggageSelections.get(index));
    return `P${index + 1}: ${baggage?.label ?? "—"}`;
  }).join(" · ");

  const snapshot = () => {
    const current = selectedOffer();
    const price = current?.price ?? 0;
    const currency = current?.currency ?? "EUR";
    const insurance = insuranceById(selectedInsurance);
    const extraNames = [...selectedExtras].flatMap((id) => {
      const option = extraById(id);
      return option ? [option.name] : [];
    });
    return {
      version: "1" as const,
      revision,
      state: {
        "selected-offer": selectedOfferId ?? null,
        "fare-bundle": selectedFare,
        "passenger-details": passengerDetails,
        contact: bookingContact ?? null,
        "seat-selections": [...seatSelections.entries()].map(([index, seat]) => ({ passengerIndex: index, seat })),
        "baggage-selections": [...baggageSelections.entries()].map(([index, optionId]) => ({ passengerIndex: index, optionId })),
        "insurance-id": selectedInsurance,
        extras: [...selectedExtras],
      },
      domain: {
        results: {
          origin: searchInput.origin,
          destination: searchInput.destination,
          departure: searchInput.departureDate,
          passengers: searchInput.passengers,
          "base-price": price,
          currency,
        },
        booking: { passengers: searchInput.passengers, fare: selectedFare },
        extras: { "insurance-id": selectedInsurance, selected: [...selectedExtras].join(",") },
        review: {
          origin: searchInput.origin,
          destination: searchInput.destination,
          passengers: searchInput.passengers,
          fare: selectedFare,
          "base-price": price,
          currency,
          "flight-number": current?.flightNumber ?? "Flight",
          schedule: current ? `${current.departure}–${current.arrival} · ${current.duration}` : "—",
          "seat-summary": seatSummary(),
          "baggage-summary": baggageSummary(),
          "insurance-label": insurance?.name ?? "None",
          "extras-summary": extraNames.length > 0 ? extraNames.join(", ") : "None",
          total: total(),
        },
      },
    };
  };

  const outcome = (value: "success" | "empty") => {
    revision += 1;
    return { outcome: value, snapshot: snapshot() };
  };
  const error = () => ({ outcome: "error" as const });

  const host = {
    version: "1",
    id: "airline.flight-booking.host",
    snapshot,
    dispatch: async (action: unknown) => {
      const actionRecord = record(action);
      const type = actionRecord?.type;
      const actionPayload = record(actionRecord?.payload) ?? {};

      if (type === "travel.flight.search.submit") {
        if (typeof actionPayload.origin !== "string"
          || typeof actionPayload.destination !== "string"
          || typeof actionPayload.departureDate !== "string"
          || typeof actionPayload.passengers !== "number"
          || !Number.isInteger(actionPayload.passengers)
          || actionPayload.passengers < 1
          || actionPayload.passengers > 8) return error();
        try {
          const searched = searchFlights({
            origin: actionPayload.origin,
            destination: actionPayload.destination,
            departureDate: actionPayload.departureDate,
            passengers: actionPayload.passengers,
          });
          searchInput = {
            origin: searched.origin,
            destination: searched.destination,
            departureDate: searched.departureDate,
            passengers: searched.passengers,
          };
          offers = searched.offers;
          selectedOfferId = undefined;
          selectedFare = "smart";
          resetDownstream();
          return outcome("success");
        } catch {
          return error();
        }
      }

      if (type === "travel.flight.offer.select") {
        const offerId = requiredText(actionPayload.offerId);
        if (!offerId || !offers.some((candidate) => candidate.id === offerId)) return error();
        selectedOfferId = offerId;
        selectedFare = "smart";
        resetDownstream();
        return outcome("success");
      }

      if (type === "travel.flight.fare.select") {
        const fare = fareById(actionPayload.fareId);
        if (!fare) return error();
        selectedFare = fare.id;
        resetDownstream();
        return outcome("success");
      }

      if (type === "travel.flight.passenger.submit") {
        if (!Array.isArray(actionPayload.passengers) || actionPayload.passengers.length !== searchInput.passengers) return error();
        const parsedPassengers = actionPayload.passengers.flatMap((entry) => {
          const person = record(entry);
          const firstName = requiredText(person?.firstName);
          const lastName = requiredText(person?.lastName);
          const birthDate = requiredText(person?.birthDate);
          return firstName && lastName && birthDate ? [{ firstName, lastName, birthDate }] : [];
        });
        const contact = record(actionPayload.contact);
        const email = requiredText(contact?.email);
        const phone = requiredText(contact?.phone);
        if (parsedPassengers.length !== searchInput.passengers || !email || !phone) return error();
        passengerDetails = parsedPassengers;
        bookingContact = { email, phone };
        seatSelections.clear();
        baggageSelections.clear();
        selectedInsurance = "none";
        selectedExtras.clear();
        return outcome("success");
      }

      if (type === "travel.flight.seat.select") {
        const index = passengerIndex(actionPayload.passengerIndex, searchInput.passengers);
        const seat = seatById(actionPayload.seat);
        if (index === undefined || !seat || seat.occupied === true) return error();
        if ([...seatSelections.entries()].some(([otherIndex, seatId]) => otherIndex !== index && seatId === seat.id)) return error();
        seatSelections.set(index, seat.id);
        return outcome(seatSelections.size >= searchInput.passengers ? "success" : "empty");
      }

      if (type === "travel.flight.baggage.select") {
        const baggage = baggageById(actionPayload.optionId);
        if (!baggage) return error();
        if (actionPayload.applyToAll === true) {
          baggageSelections.clear();
          for (let index = 0; index < searchInput.passengers; index += 1) baggageSelections.set(index, baggage.id);
          return outcome("success");
        }
        const index = passengerIndex(actionPayload.passengerIndex, searchInput.passengers);
        if (index === undefined) return error();
        baggageSelections.set(index, baggage.id);
        return outcome(baggageSelections.size >= searchInput.passengers ? "success" : "empty");
      }

      if (type === "travel.flight.extras.submit") {
        const insurance = insuranceById(actionPayload.insuranceId);
        const extras = Array.isArray(actionPayload.extras)
          ? actionPayload.extras.filter((entry): entry is string => typeof entry === "string")
          : undefined;
        if (!insurance || !extras || extras.some((id) => !extraById(id))) return error();
        selectedInsurance = insurance.id;
        selectedExtras.clear();
        for (const id of extras) selectedExtras.add(id);
        return outcome("success");
      }

      if (type === "travel.flight.assistant.command") {
        if (actionPayload.command === "set-insurance") {
          const insurance = insuranceById(actionPayload.value);
          if (!insurance) return error();
          selectedInsurance = insurance.id;
          return outcome("success");
        }
        if (actionPayload.command === "add-extra") {
          const extra = extraById(actionPayload.value);
          if (!extra) return error();
          selectedExtras.add(extra.id);
          return outcome("success");
        }
        return error();
      }

      if (type === "travel.flight.booking.handoff") return outcome("success");
      return error();
    },
    subscribe: () => () => {},
  };

  const dispatch = async (
    runtime: Parameters<ViraCommandAdapter>[0]["runtime"],
    nodeId: string,
    event: string,
    actionPayload: Readonly<Record<string, unknown>>,
  ): Promise<ViraCommandAdapterResult> => {
    const result = await runtime.controller.dispatch({ nodeId, event, payload: actionPayload });
    return result.ok ? commandSuccess() : commandFailure("DISPATCH_REJECTED", "runtime rejected command", "$.command");
  };

  const commands: Readonly<Record<string, ViraCommandAdapter>> = Object.freeze({
    "select-cheapest": async ({ runtime }) => {
      if (runtime.controller.currentViewId() !== "flight-results") return commandFailure("WRONG_STEP", "flight results are not active");
      const cheapest = [...offers].filter((candidate) => Number.isFinite(candidate.price)).sort((left, right) => left.price - right.price)[0];
      if (!cheapest) return commandFailure("INVALID_VALUE", "no selectable flight offer exists");
      return dispatch(runtime, "flight-results-root", "select", { offerId: cheapest.id });
    },
    "select-fare": async ({ runtime, args }) => {
      if (runtime.controller.currentViewId() !== "fare-comparison") return commandFailure("WRONG_STEP", "fare comparison is not active");
      const fare = fareById(args.value);
      if (!fare) return commandFailure("INVALID_VALUE", "fare value is invalid", "$.args.value");
      return dispatch(runtime, "fare-comparison-root", "select", { fareId: fare.id });
    },
    "set-seat-zone": async ({ runtime, args }) => {
      if (runtime.controller.currentViewId() !== "seat-selection") return commandFailure("WRONG_STEP", "seat selection is not active");
      const zone = args.value;
      if (zone !== "front" && zone !== "extra-legroom" && zone !== "standard") {
        return commandFailure("INVALID_VALUE", "seat zone is invalid", "$.args.value");
      }
      const seats = SEAT_OPTIONS.filter((candidate) => candidate.zone === zone && candidate.occupied !== true).slice(0, searchInput.passengers);
      if (seats.length !== searchInput.passengers) return commandFailure("INVALID_VALUE", "not enough seats exist in the requested zone", "$.args.value");
      for (let passengerIndex = 0; passengerIndex < seats.length; passengerIndex += 1) {
        const seat = seats[passengerIndex];
        if (!seat) return commandFailure("INVALID_VALUE", "seat assignment failed");
        const result = await runtime.controller.dispatch({
          nodeId: "seat-selection-root",
          event: "select",
          payload: { passengerIndex, seat: seat.id },
        });
        if (!result.ok) return commandFailure("DISPATCH_REJECTED", "runtime rejected seat assignment", "$.command");
      }
      return commandSuccess();
    },
    "set-baggage-all": async ({ runtime, args }) => {
      if (runtime.controller.currentViewId() !== "baggage") return commandFailure("WRONG_STEP", "baggage selection is not active");
      const baggage = baggageById(args.value);
      if (!baggage) return commandFailure("INVALID_VALUE", "baggage value is invalid", "$.args.value");
      return dispatch(runtime, "baggage-root", "select", { applyToAll: true, optionId: baggage.id });
    },
    "set-insurance": async ({ runtime, args }) => {
      const view = runtime.controller.currentViewId();
      if (view !== "extras" && view !== "booking-review") return commandFailure("WRONG_STEP", "insurance can be changed only in extras or review");
      const insurance = insuranceById(args.value);
      if (!insurance) return commandFailure("INVALID_VALUE", "insurance value is invalid", "$.args.value");
      return dispatch(runtime, `${view}-root`, "assistant-command", { command: "set-insurance", value: insurance.id });
    },
    "add-extra": async ({ runtime, args }) => {
      const view = runtime.controller.currentViewId();
      if (view !== "extras" && view !== "booking-review") return commandFailure("WRONG_STEP", "extras can be changed only in extras or review");
      const extra = extraById(args.value);
      if (!extra) return commandFailure("INVALID_VALUE", "extra value is invalid", "$.args.value");
      return dispatch(runtime, `${view}-root`, "assistant-command", { command: "add-extra", value: extra.id });
    },
  });

  return Object.freeze({
    componentCatalog: FLIGHT_BOOKING_COMPONENT_CATALOG,
    bindingSourceCatalog: FLIGHT_BOOKING_BINDING_SOURCE_CATALOG,
    actionAdapter: FLIGHT_BOOKING_ACTION_ADAPTER,
    runtimeState: runtimeState(),
    permissionPolicy: FLIGHT_BOOKING_PERMISSION_POLICY,
    host,
    renderers: CANONICAL_CHAT_RENDERERS,
    commands,
  });
}

export const FLIGHT_BOOKING_RUNTIME_PROFILE: ViraRuntimeCapabilityProfile = Object.freeze({
  id: "airline.flight-booking.runtime",
  componentRefs: FLIGHT_BOOKING_PUBLICATION.manifest.componentRefs,
  actionEvents: FLIGHT_BOOKING_PUBLICATION.manifest.actionEvents,
  bindingSources: FLIGHT_BOOKING_PUBLICATION.manifest.bindingSources,
  prepare: ({ payload }: ViraRuntimeProfileContext) => prepareFlightRuntime(payload),
});
