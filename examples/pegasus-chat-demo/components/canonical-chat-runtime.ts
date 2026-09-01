import {
  AIRLINE_STUDIO_COMPONENTS,
  baggageById,
  extraById,
  fareById,
  insuranceById,
  seatById,
} from "@vira-enterprise-genui/airline-brand-kit";
import {
  AIRLINE_STUDIO_CATALOG_INPUT,
  createAirlineStarterDocument,
} from "@vira-enterprise-genui/airline-brand-kit/studio";
import {
  createViraExperienceRuntime,
  prepareAuthoredStudioPublication,
  type StudioAuthoringDocumentInput,
  type ViraExperienceRuntime,
} from "@vira-enterprise-genui/genui";
import { searchFlights } from "@vira-enterprise-genui/mock-airline-domain";
import type { JsonValue } from "@vira-enterprise-genui/protocol";
import { createRuntimeState } from "@vira-enterprise-genui/runtime-core";
import type { FlightOffer, ViraFlightExperienceResult } from "../lib/vira-chat-contract";

const STEPS = [
  "flight-search",
  "flight-results",
  "fare-comparison",
  "traveller-details",
  "seat-selection",
  "baggage",
  "extras",
  "booking-review",
] as const;

const assistantCommandEvent = Object.freeze({
  name: "assistant-command",
  label: "Assistant booking update",
  payload: [
    {
      key: "command",
      type: "enum",
      required: true,
      options: ["set-insurance", "add-extra"],
    },
    { key: "value", type: "string", required: true },
  ],
} as const);

export const CANONICAL_CHAT_COMPONENT_CATALOG = Object.freeze({
  ...AIRLINE_STUDIO_CATALOG_INPUT,
  id: "airline.chat.studio.components",
  components: Object.freeze(AIRLINE_STUDIO_CATALOG_INPUT.components.map((component) => {
    const withDeparture = component.ref === AIRLINE_STUDIO_COMPONENTS.flightResults
      ? Object.freeze({
          ...component,
          props: Object.freeze([
            ...component.props,
            { key: "departure", type: "string", required: false, bindable: true },
          ]),
        })
      : component;
    return withDeparture.ref === AIRLINE_STUDIO_COMPONENTS.extrasSelector
      || withDeparture.ref === AIRLINE_STUDIO_COMPONENTS.bookingReview
      ? Object.freeze({
          ...withDeparture,
          events: Object.freeze([...withDeparture.events, assistantCommandEvent]),
        })
      : withDeparture;
  })),
});

const actionAdapter = {
  version: "1",
  id: "airline.chat.studio.actions",
  mappings: [
    { event: "flight.search.submit", actionType: "travel.flight.search.submit" },
    { event: "flight.offer.select", actionType: "travel.flight.offer.select" },
    { event: "flight.fare.select", actionType: "travel.flight.fare.select" },
    { event: "flight.passenger.submit", actionType: "travel.flight.passenger.submit" },
    { event: "flight.seat.select", actionType: "travel.flight.seat.select" },
    { event: "flight.baggage.select", actionType: "travel.flight.baggage.select" },
    { event: "flight.extras.submit", actionType: "travel.flight.extras.submit" },
    { event: "flight.booking.handoff", actionType: "travel.flight.booking.handoff" },
    { event: "flight.assistant.command", actionType: "travel.flight.assistant.command" },
  ],
} as const;

const bindingSourceCatalog = {
  version: "1",
  id: "airline.chat.studio.data",
  sources: [
    { kind: "domain", path: "results.origin", label: "Results origin", valueType: "string" },
    { kind: "domain", path: "results.destination", label: "Results destination", valueType: "string" },
    { kind: "domain", path: "results.departure", label: "Results departure", valueType: "string" },
    { kind: "domain", path: "results.passengers", label: "Results passengers", valueType: "number" },
    { kind: "domain", path: "results.base-price", label: "Results base price", valueType: "number" },
    { kind: "domain", path: "results.currency", label: "Results currency", valueType: "string" },
    { kind: "domain", path: "booking.passengers", label: "Booking passengers", valueType: "number" },
    { kind: "domain", path: "booking.fare", label: "Booking fare", valueType: "enum" },
    { kind: "domain", path: "review.origin", label: "Review origin", valueType: "string" },
    { kind: "domain", path: "review.destination", label: "Review destination", valueType: "string" },
    { kind: "domain", path: "review.passengers", label: "Review passengers", valueType: "number" },
    { kind: "domain", path: "review.fare", label: "Review fare", valueType: "enum" },
    { kind: "domain", path: "review.base-price", label: "Review base price", valueType: "number" },
    { kind: "domain", path: "review.currency", label: "Review currency", valueType: "string" },
  ],
} as const;

const permissionPolicy = {
  version: "1",
  rules: actionAdapter.mappings.map((mapping) => ({
    subject: "action" as const,
    id: mapping.actionType,
    effect: "allow" as const,
  })),
} as const;

function runtimeState() {
  const result = createRuntimeState("pegasus-chat-studio", {
    version: "1",
    id: "pegasus-chat-studio-plan",
    intent: { version: "1", namespace: "travel.flight", name: "search" },
    state: {},
    capabilities: { required: [], available: [], future: [] },
  });
  return result.ok ? result.value : undefined;
}

type AuthoredView = StudioAuthoringDocumentInput["views"][number];
type AuthoredBinding = NonNullable<StudioAuthoringDocumentInput["bindings"]>[number];
type AuthoredInteraction = NonNullable<StudioAuthoringDocumentInput["interactions"]>[number];

const bindingsByStep: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze({
  "flight-results": Object.freeze({
    origin: "results.origin",
    destination: "results.destination",
    departure: "results.departure",
    passengers: "results.passengers",
    "base-price": "results.base-price",
    currency: "results.currency",
  }),
  "fare-comparison": Object.freeze({
    "base-price": "results.base-price",
    currency: "results.currency",
    passengers: "booking.passengers",
  }),
  "traveller-details": Object.freeze({ passengers: "booking.passengers" }),
  "seat-selection": Object.freeze({ passengers: "booking.passengers", fare: "booking.fare" }),
  baggage: Object.freeze({ passengers: "booking.passengers", fare: "booking.fare" }),
  extras: Object.freeze({ passengers: "booking.passengers", fare: "booking.fare" }),
  "booking-review": Object.freeze({
    origin: "review.origin",
    destination: "review.destination",
    passengers: "review.passengers",
    fare: "review.fare",
    "base-price": "review.base-price",
    currency: "review.currency",
  }),
});

export function createCanonicalChatDocument(
  result: ViraFlightExperienceResult,
): StudioAuthoringDocumentInput {
  const views: AuthoredView[] = [];
  const bindings: AuthoredBinding[] = [];
  const interactions: AuthoredInteraction[] = [];

  for (const [index, step] of STEPS.entries()) {
    const source = createAirlineStarterDocument(`chat.segment.${step}`, step);
    const view = source.views[0];
    const node = view?.nodes[0];
    if (!view || !node) throw new Error(`Missing airline Studio starter: ${step}`);
    const next = STEPS[index + 1] ?? "confirmation";
    const id = `${step}-root`;
    const props: Record<string, JsonValue> = { ...node.props };
    if (step === "flight-search") {
      props.origin = result.input.origin;
      props.destination = result.input.destination;
      props.departure = result.input.departureDate;
      props.passengers = result.input.passengers;
    } else if (step === "flight-results") {
      const first = result.data.offers[0];
      props.origin = result.input.origin;
      props.destination = result.input.destination;
      props.departure = result.input.departureDate;
      props.passengers = result.input.passengers;
      props["base-price"] = first?.price ?? 0;
      props.currency = first?.currency ?? "EUR";
    }

    for (const [prop, path] of Object.entries(bindingsByStep[step] ?? {})) {
      delete props[prop];
      bindings.push({
        viewId: step,
        nodeId: id,
        prop,
        source: { kind: "domain", path },
      });
    }

    views.push({ id: step, nodes: [{ ...node, id, props }] });
    for (const interaction of source.interactions) {
      interactions.push({
        ...interaction,
        viewId: step,
        nodeId: id,
        routes: [{ outcome: "success", viewId: next }],
      });
    }
    if (step === "extras" || step === "booking-review") {
      interactions.push({
        viewId: step,
        nodeId: id,
        event: "assistant-command",
        actionEvent: "flight.assistant.command",
        routes: [{ outcome: "success", viewId: step }],
      });
    }
  }

  const review = createAirlineStarterDocument("chat.segment.confirmation", "booking-review");
  const reviewNode = review.views[0]?.nodes[0];
  if (!reviewNode) throw new Error("Missing booking review confirmation node");
  views.push({ id: "confirmation", nodes: [{ ...reviewNode, id: "confirmation-root" }] });

  return {
    id: "pegasus.chat.approved-booking",
    recipeId: "studio.airline.chat-approved-booking",
    entryView: "flight-search",
    views,
    bindings,
    interactions,
  };
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

export interface CanonicalChatRuntimeBundle {
  readonly runtime: ViraExperienceRuntime;
  readonly offers: () => readonly FlightOffer[];
}

export function createCanonicalChatRuntime(
  result: ViraFlightExperienceResult,
): CanonicalChatRuntimeBundle | undefined {
  const state = runtimeState();
  if (!state) return undefined;
  const publication = prepareAuthoredStudioPublication({
    document: createCanonicalChatDocument(result),
    componentCatalog: CANONICAL_CHAT_COMPONENT_CATALOG,
    bindingSourceCatalog,
    actionAdapter,
  });
  if (!publication.ok) return undefined;

  let revision = 1;
  let searchInput = { ...result.input };
  let offers: readonly FlightOffer[] = [...result.data.offers];
  let selectedOfferId: string | undefined;
  let selectedFare = "smart";
  let selectedInsurance = "none";
  const selectedExtras = new Set<string>();

  const selectedOffer = (): FlightOffer | undefined =>
    offers.find((offer) => offer.id === selectedOfferId) ?? offers[0];

  const snapshot = () => {
    const offer = selectedOffer();
    const price = offer?.price ?? 0;
    const currency = offer?.currency ?? "EUR";
    return {
      version: "1" as const,
      revision,
      state: {
        "selected-offer": selectedOfferId ?? null,
        "fare-bundle": selectedFare,
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
        booking: {
          passengers: searchInput.passengers,
          fare: selectedFare,
        },
        review: {
          origin: searchInput.origin,
          destination: searchInput.destination,
          passengers: searchInput.passengers,
          fare: selectedFare,
          "base-price": price,
          currency,
        },
      },
    };
  };

  const success = () => {
    revision += 1;
    return { outcome: "success" as const, snapshot: snapshot() };
  };
  const error = () => ({ outcome: "error" as const });

  const host = {
    version: "1",
    id: "pegasus.chat.approved-host",
    snapshot,
    dispatch: async (action: unknown) => {
      const actionRecord = record(action);
      const type = actionRecord?.type;
      const payload = record(actionRecord?.payload) ?? {};

      if (type === "travel.flight.search.submit") {
        if (typeof payload.origin !== "string"
          || typeof payload.destination !== "string"
          || typeof payload.departureDate !== "string"
          || typeof payload.passengers !== "number"
          || !Number.isInteger(payload.passengers)) return error();
        try {
          const searched = searchFlights({
            origin: payload.origin,
            destination: payload.destination,
            departureDate: payload.departureDate,
            passengers: payload.passengers,
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
          selectedInsurance = "none";
          selectedExtras.clear();
          return success();
        } catch {
          return error();
        }
      }

      if (type === "travel.flight.offer.select") {
        const offerId = typeof payload.offerId === "string" ? payload.offerId : undefined;
        if (!offerId || !offers.some((offer) => offer.id === offerId)) return error();
        selectedOfferId = offerId;
        return success();
      }

      if (type === "travel.flight.fare.select") {
        const fare = fareById(payload.fareId);
        if (!fare) return error();
        selectedFare = fare.id;
        return success();
      }

      if (type === "travel.flight.seat.select") {
        if (!seatById(payload.seat)) return error();
        return success();
      }

      if (type === "travel.flight.baggage.select") {
        if (!baggageById(payload.optionId)) return error();
        return success();
      }

      if (type === "travel.flight.extras.submit") {
        const insurance = insuranceById(payload.insuranceId);
        const extras = Array.isArray(payload.extras)
          ? payload.extras.filter((entry): entry is string => typeof entry === "string")
          : undefined;
        if (!insurance || !extras || extras.some((id) => !extraById(id))) return error();
        selectedInsurance = insurance.id;
        selectedExtras.clear();
        for (const id of extras) selectedExtras.add(id);
        return success();
      }

      if (type === "travel.flight.assistant.command") {
        if (payload.command === "set-insurance") {
          const insurance = insuranceById(payload.value);
          if (!insurance) return error();
          selectedInsurance = insurance.id;
          return success();
        }
        if (payload.command === "add-extra") {
          const extra = extraById(payload.value);
          if (!extra) return error();
          selectedExtras.add(extra.id);
          return success();
        }
        return error();
      }

      if (type === "travel.flight.passenger.submit" || type === "travel.flight.booking.handoff") {
        return success();
      }

      return error();
    },
    subscribe: () => () => {},
  };

  const runtime = createViraExperienceRuntime({
    publication: publication.value,
    componentCatalog: CANONICAL_CHAT_COMPONENT_CATALOG,
    bindingSourceCatalog,
    actionAdapter,
    runtimeState: state,
    permissionPolicy,
    host,
  });
  return runtime.ok
    ? Object.freeze({ runtime: runtime.value, offers: () => offers })
    : undefined;
}
