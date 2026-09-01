import { AIRLINE_STUDIO_COMPONENTS } from "@vira-enterprise-genui/airline-brand-kit";
import {
  AIRLINE_STUDIO_CATALOG_INPUT,
  createAirlineStarterDocument,
} from "@vira-enterprise-genui/airline-brand-kit/studio";
import type { StudioAuthoringDocumentInput } from "@vira-enterprise-genui/genui";
import type { JsonValue } from "@vira-enterprise-genui/protocol";
import type { ViraFlightExperienceResult } from "../lib/vira-chat-contract";

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
      required: false,
      options: ["set-insurance", "add-extra"],
    },
    { key: "value", type: "string", required: false },
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

export const CANONICAL_CHAT_ACTION_ADAPTER = Object.freeze({
  version: "1" as const,
  id: "airline.chat.studio.actions",
  mappings: Object.freeze([
    { event: "flight.search.submit", actionType: "travel.flight.search.submit" },
    { event: "flight.offer.select", actionType: "travel.flight.offer.select" },
    { event: "flight.fare.select", actionType: "travel.flight.fare.select" },
    { event: "flight.passenger.submit", actionType: "travel.flight.passenger.submit" },
    { event: "flight.seat.select", actionType: "travel.flight.seat.select" },
    { event: "flight.baggage.select", actionType: "travel.flight.baggage.select" },
    { event: "flight.extras.submit", actionType: "travel.flight.extras.submit" },
    { event: "flight.booking.handoff", actionType: "travel.flight.booking.handoff" },
    { event: "flight.assistant.command", actionType: "travel.flight.assistant.command" },
  ]),
});

export const CANONICAL_CHAT_BINDING_SOURCE_CATALOG = Object.freeze({
  version: "1" as const,
  id: "airline.chat.studio.data",
  sources: Object.freeze([
    { kind: "domain" as const, path: "results.origin", label: "Results origin", valueType: "string" as const },
    { kind: "domain" as const, path: "results.destination", label: "Results destination", valueType: "string" as const },
    { kind: "domain" as const, path: "results.departure", label: "Results departure", valueType: "string" as const },
    { kind: "domain" as const, path: "results.passengers", label: "Results passengers", valueType: "number" as const },
    { kind: "domain" as const, path: "results.base-price", label: "Results base price", valueType: "number" as const },
    { kind: "domain" as const, path: "results.currency", label: "Results currency", valueType: "string" as const },
    { kind: "domain" as const, path: "booking.passengers", label: "Booking passengers", valueType: "number" as const },
    { kind: "domain" as const, path: "booking.fare", label: "Booking fare", valueType: "enum" as const },
    { kind: "domain" as const, path: "review.origin", label: "Review origin", valueType: "string" as const },
    { kind: "domain" as const, path: "review.destination", label: "Review destination", valueType: "string" as const },
    { kind: "domain" as const, path: "review.passengers", label: "Review passengers", valueType: "number" as const },
    { kind: "domain" as const, path: "review.fare", label: "Review fare", valueType: "enum" as const },
    { kind: "domain" as const, path: "review.base-price", label: "Review base price", valueType: "number" as const },
    { kind: "domain" as const, path: "review.currency", label: "Review currency", valueType: "string" as const },
  ]),
});

export const CANONICAL_CHAT_PERMISSION_POLICY = Object.freeze({
  version: "1" as const,
  rules: Object.freeze(CANONICAL_CHAT_ACTION_ADAPTER.mappings.map((mapping) => ({
    subject: "action" as const,
    id: mapping.actionType,
    effect: "allow" as const,
  }))),
});

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
