import {
  prepareAuthoredStudioPublication,
  type StudioAuthoringDocumentInput,
} from "@vira-enterprise-genui/genui";
import { parseExperiencePackManifest } from "@vira-enterprise-genui/experience-packs";
import { AIRLINE_STUDIO_COMPONENTS } from "./runtime.js";
import { AIRLINE_STUDIO_CATALOG_INPUT } from "./studio.js";

export const FLIGHT_BOOKING_PACK_ID = "vira/flight-booking" as const;
export const FLIGHT_BOOKING_PACK_VERSION = "1.0.0" as const;
export const FLIGHT_BOOKING_ENTRYPOINT = "booking" as const;
export const FLIGHT_BOOKING_ARTIFACT_DIGEST = "sha256:261eb4be230d1ce66453d2b700ef1768032bd1e9aa5c35d9b2233a19fba786e2" as const;
export const FLIGHT_BOOKING_ARTIFACT_SIZE = 10_622 as const;

const assistantCommandEvent = Object.freeze({
  name: "assistant-command",
  label: "Assistant booking update",
  payload: Object.freeze([
    Object.freeze({ key: "command", type: "enum", required: false, options: Object.freeze(["set-insurance", "add-extra"]) }),
    Object.freeze({ key: "value", type: "string", required: false }),
  ]),
} as const);

function extendComponent(component: (typeof AIRLINE_STUDIO_CATALOG_INPUT.components)[number]) {
  const extraProps = component.ref === AIRLINE_STUDIO_COMPONENTS.flightResults
    ? [{ key: "departure", type: "string", required: false, bindable: true }] as const
    : component.ref === AIRLINE_STUDIO_COMPONENTS.extrasSelector
      ? [
          { key: "insurance-id", type: "string", required: false, bindable: true },
          { key: "selected-extras", type: "string", required: false, bindable: true },
        ] as const
      : component.ref === AIRLINE_STUDIO_COMPONENTS.bookingReview
        ? [
            { key: "flight-number", type: "string", required: false, bindable: true },
            { key: "schedule", type: "string", required: false, bindable: true },
            { key: "seat-summary", type: "string", required: false, bindable: true },
            { key: "baggage-summary", type: "string", required: false, bindable: true },
            { key: "insurance-label", type: "string", required: false, bindable: true },
            { key: "extras-summary", type: "string", required: false, bindable: true },
            { key: "total", type: "number", required: false, bindable: true },
          ] as const
        : [] as const;
  const events = component.ref === AIRLINE_STUDIO_COMPONENTS.extrasSelector
    || component.ref === AIRLINE_STUDIO_COMPONENTS.bookingReview
    ? Object.freeze([...component.events, assistantCommandEvent])
    : component.events;
  return Object.freeze({
    ...component,
    props: Object.freeze([...component.props, ...extraProps]),
    events,
  });
}

export const FLIGHT_BOOKING_COMPONENT_CATALOG = Object.freeze({
  ...AIRLINE_STUDIO_CATALOG_INPUT,
  id: "airline.flight-booking.components",
  components: Object.freeze(AIRLINE_STUDIO_CATALOG_INPUT.components.map(extendComponent)),
});

export const FLIGHT_BOOKING_ACTION_ADAPTER = Object.freeze({
  version: "1" as const,
  id: "airline.flight-booking.actions",
  mappings: Object.freeze([
    Object.freeze({ event: "flight.search.submit", actionType: "travel.flight.search.submit" }),
    Object.freeze({ event: "flight.offer.select", actionType: "travel.flight.offer.select" }),
    Object.freeze({ event: "flight.fare.select", actionType: "travel.flight.fare.select" }),
    Object.freeze({ event: "flight.passenger.submit", actionType: "travel.flight.passenger.submit" }),
    Object.freeze({ event: "flight.seat.select", actionType: "travel.flight.seat.select" }),
    Object.freeze({ event: "flight.baggage.select", actionType: "travel.flight.baggage.select" }),
    Object.freeze({ event: "flight.extras.submit", actionType: "travel.flight.extras.submit" }),
    Object.freeze({ event: "flight.booking.handoff", actionType: "travel.flight.booking.handoff" }),
    Object.freeze({ event: "flight.assistant.command", actionType: "travel.flight.assistant.command" }),
  ]),
});

export const FLIGHT_BOOKING_BINDING_SOURCE_CATALOG = Object.freeze({
  version: "1" as const,
  id: "airline.flight-booking.data",
  sources: Object.freeze([
    Object.freeze({ kind: "domain" as const, path: "results.origin", label: "Results origin", valueType: "string" as const }),
    Object.freeze({ kind: "domain" as const, path: "results.destination", label: "Results destination", valueType: "string" as const }),
    Object.freeze({ kind: "domain" as const, path: "results.departure", label: "Results departure", valueType: "string" as const }),
    Object.freeze({ kind: "domain" as const, path: "results.passengers", label: "Results passengers", valueType: "number" as const }),
    Object.freeze({ kind: "domain" as const, path: "results.base-price", label: "Results base price", valueType: "number" as const }),
    Object.freeze({ kind: "domain" as const, path: "results.currency", label: "Results currency", valueType: "string" as const }),
    Object.freeze({ kind: "domain" as const, path: "booking.passengers", label: "Booking passengers", valueType: "number" as const }),
    Object.freeze({ kind: "domain" as const, path: "booking.fare", label: "Booking fare", valueType: "enum" as const }),
    Object.freeze({ kind: "domain" as const, path: "extras.insurance-id", label: "Selected insurance", valueType: "string" as const }),
    Object.freeze({ kind: "domain" as const, path: "extras.selected", label: "Selected extras", valueType: "string" as const }),
    Object.freeze({ kind: "domain" as const, path: "review.origin", label: "Review origin", valueType: "string" as const }),
    Object.freeze({ kind: "domain" as const, path: "review.destination", label: "Review destination", valueType: "string" as const }),
    Object.freeze({ kind: "domain" as const, path: "review.passengers", label: "Review passengers", valueType: "number" as const }),
    Object.freeze({ kind: "domain" as const, path: "review.fare", label: "Review fare", valueType: "enum" as const }),
    Object.freeze({ kind: "domain" as const, path: "review.base-price", label: "Review base price", valueType: "number" as const }),
    Object.freeze({ kind: "domain" as const, path: "review.currency", label: "Review currency", valueType: "string" as const }),
    Object.freeze({ kind: "domain" as const, path: "review.flight-number", label: "Review flight number", valueType: "string" as const }),
    Object.freeze({ kind: "domain" as const, path: "review.schedule", label: "Review schedule", valueType: "string" as const }),
    Object.freeze({ kind: "domain" as const, path: "review.seat-summary", label: "Review seats", valueType: "string" as const }),
    Object.freeze({ kind: "domain" as const, path: "review.baggage-summary", label: "Review baggage", valueType: "string" as const }),
    Object.freeze({ kind: "domain" as const, path: "review.insurance-label", label: "Review insurance", valueType: "string" as const }),
    Object.freeze({ kind: "domain" as const, path: "review.extras-summary", label: "Review extras", valueType: "string" as const }),
    Object.freeze({ kind: "domain" as const, path: "review.total", label: "Review total", valueType: "number" as const }),
  ]),
});

export const FLIGHT_BOOKING_PERMISSION_POLICY = Object.freeze({
  version: "1" as const,
  rules: Object.freeze(FLIGHT_BOOKING_ACTION_ADAPTER.mappings.map((mapping) => Object.freeze({
    subject: "action" as const,
    id: mapping.actionType,
    effect: "allow" as const,
  }))),
});

const componentByStep = Object.freeze({
  "flight-search": AIRLINE_STUDIO_COMPONENTS.flightSearch,
  "flight-results": AIRLINE_STUDIO_COMPONENTS.flightResults,
  "fare-comparison": AIRLINE_STUDIO_COMPONENTS.fareComparison,
  "traveller-details": AIRLINE_STUDIO_COMPONENTS.travellerDetails,
  "seat-selection": AIRLINE_STUDIO_COMPONENTS.seatMap,
  baggage: AIRLINE_STUDIO_COMPONENTS.baggageSelector,
  extras: AIRLINE_STUDIO_COMPONENTS.extrasSelector,
  "booking-review": AIRLINE_STUDIO_COMPONENTS.bookingReview,
} as const);

const bindingsByStep = Object.freeze({
  "flight-search": Object.freeze({ origin: "results.origin", destination: "results.destination", departure: "results.departure", passengers: "results.passengers" }),
  "flight-results": Object.freeze({ origin: "results.origin", destination: "results.destination", departure: "results.departure", passengers: "results.passengers", "base-price": "results.base-price", currency: "results.currency" }),
  "fare-comparison": Object.freeze({ "base-price": "results.base-price", currency: "results.currency", passengers: "booking.passengers" }),
  "traveller-details": Object.freeze({ passengers: "booking.passengers" }),
  "seat-selection": Object.freeze({ passengers: "booking.passengers", fare: "booking.fare" }),
  baggage: Object.freeze({ passengers: "booking.passengers", fare: "booking.fare" }),
  extras: Object.freeze({ passengers: "booking.passengers", fare: "booking.fare", "insurance-id": "extras.insurance-id", "selected-extras": "extras.selected" }),
  "booking-review": Object.freeze({
    origin: "review.origin",
    destination: "review.destination",
    passengers: "review.passengers",
    fare: "review.fare",
    "base-price": "review.base-price",
    currency: "review.currency",
    "flight-number": "review.flight-number",
    schedule: "review.schedule",
    "seat-summary": "review.seat-summary",
    "baggage-summary": "review.baggage-summary",
    "insurance-label": "review.insurance-label",
    "extras-summary": "review.extras-summary",
    total: "review.total",
  }),
} as const);

const interactionByStep = Object.freeze({
  "flight-search": Object.freeze({ event: "submit", actionEvent: "flight.search.submit" }),
  "flight-results": Object.freeze({ event: "select", actionEvent: "flight.offer.select" }),
  "fare-comparison": Object.freeze({ event: "select", actionEvent: "flight.fare.select" }),
  "traveller-details": Object.freeze({ event: "submit", actionEvent: "flight.passenger.submit" }),
  "seat-selection": Object.freeze({ event: "select", actionEvent: "flight.seat.select" }),
  baggage: Object.freeze({ event: "select", actionEvent: "flight.baggage.select" }),
  extras: Object.freeze({ event: "submit", actionEvent: "flight.extras.submit" }),
  "booking-review": Object.freeze({ event: "continue", actionEvent: "flight.booking.handoff" }),
} as const);

const steps = Object.freeze(Object.keys(componentByStep) as readonly (keyof typeof componentByStep)[]);
type AuthoredBinding = NonNullable<StudioAuthoringDocumentInput["bindings"]>[number];
type AuthoredInteraction = NonNullable<StudioAuthoringDocumentInput["interactions"]>[number];

function createFlightBookingDocument(): StudioAuthoringDocumentInput {
  const views: StudioAuthoringDocumentInput["views"][number][] = [];
  const bindings: AuthoredBinding[] = [];
  const interactions: AuthoredInteraction[] = [];

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index] as keyof typeof componentByStep;
    const next = steps[index + 1] ?? "confirmation";
    const nodeId = `${step}-root`;
    views.push({ id: step, nodes: [{ id: nodeId, component: componentByStep[step], order: 0, props: {} }] });
    for (const [prop, path] of Object.entries(bindingsByStep[step])) {
      bindings.push({ viewId: step, nodeId, prop, source: { kind: "domain", path } });
    }
    const interaction = interactionByStep[step];
    interactions.push({
      viewId: step,
      nodeId,
      event: interaction.event,
      actionEvent: interaction.actionEvent,
      routes: step === "seat-selection" || step === "baggage"
        ? [{ outcome: "success", viewId: next }, { outcome: "empty", viewId: step }]
        : [{ outcome: "success", viewId: next }],
    });
    if (step === "extras" || step === "booking-review") {
      interactions.push({
        viewId: step,
        nodeId,
        event: "assistant-command",
        actionEvent: "flight.assistant.command",
        routes: [{ outcome: "success", viewId: step }],
      });
    }
  }

  const confirmationNode = "confirmation-root";
  views.push({
    id: "confirmation",
    nodes: [{ id: confirmationNode, component: AIRLINE_STUDIO_COMPONENTS.bookingReview, order: 0, props: {} }],
  });
  for (const [prop, path] of Object.entries(bindingsByStep["booking-review"])) {
    bindings.push({ viewId: "confirmation", nodeId: confirmationNode, prop, source: { kind: "domain", path } });
  }

  return {
    id: "vira.flight-booking.publication",
    recipeId: "studio.airline.flight-booking",
    entryView: "flight-search",
    views,
    bindings,
    interactions,
  };
}

const publication = prepareAuthoredStudioPublication({
  document: createFlightBookingDocument(),
  componentCatalog: FLIGHT_BOOKING_COMPONENT_CATALOG,
  bindingSourceCatalog: FLIGHT_BOOKING_BINDING_SOURCE_CATALOG,
  actionAdapter: FLIGHT_BOOKING_ACTION_ADAPTER,
});
if (!publication.ok) {
  throw new Error(`Invalid flight booking publication: ${publication.issue.path}: ${publication.issue.message}`);
}

export const FLIGHT_BOOKING_PUBLICATION = publication.value;

const serializedPublication = JSON.stringify(FLIGHT_BOOKING_PUBLICATION);
if (serializedPublication.length !== FLIGHT_BOOKING_ARTIFACT_SIZE) {
  throw new Error("Flight booking publication size drifted; regenerate Pack artifact metadata");
}

const pack = parseExperiencePackManifest({
  schemaVersion: "1",
  id: FLIGHT_BOOKING_PACK_ID,
  version: FLIGHT_BOOKING_PACK_VERSION,
  publisher: { id: "vira", name: "Vira" },
  metadata: {
    name: "Flight Booking",
    description: "Canonical airline search-to-booking GenUI journey.",
    tags: ["travel", "booking"],
  },
  compatibility: { minViraVersion: "0.0.0" },
  entrypoints: [FLIGHT_BOOKING_ENTRYPOINT],
  artifacts: [{
    id: FLIGHT_BOOKING_ENTRYPOINT,
    role: "studio-publication",
    mediaType: "application/json",
    digest: FLIGHT_BOOKING_ARTIFACT_DIGEST,
    size: FLIGHT_BOOKING_ARTIFACT_SIZE,
  }],
});
if (!pack.ok) throw new Error(`Invalid flight Experience Pack: ${pack.issue.path}: ${pack.issue.message}`);
export const FLIGHT_BOOKING_PACK_MANIFEST = pack.value;
