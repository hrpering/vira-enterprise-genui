"use client";

import {
  AIRLINE_STUDIO_COMPONENTS,
  baggageById,
  extraById,
  fareById,
  insuranceById,
  mountAirlineStudioComponent,
  seatById,
} from "@vira-enterprise-genui/airline-brand-kit";
import {
  AIRLINE_STARTER_TEMPLATES,
  AIRLINE_STUDIO_CATALOG_INPUT,
  createAirlineStarterDocument,
} from "@vira-enterprise-genui/airline-brand-kit/studio";
import {
  createViraExperienceRuntime,
  prepareAuthoredStudioPublication,
  type StudioAuthoringDocumentInput,
  type StudioRuntimeReactRenderer,
  type ViraExperienceRuntime,
} from "@vira-enterprise-genui/genui";
import { searchFlights } from "@vira-enterprise-genui/mock-airline-domain";
import { createRuntimeState } from "@vira-enterprise-genui/runtime-core";
import { createElement, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import type { FlightOffer, ViraFlightExperienceResult } from "../lib/vira-chat-contract";
import { registerCanonicalChatCommandTarget } from "./canonical-chat-command";

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

const componentCatalog = Object.freeze({
  ...AIRLINE_STUDIO_CATALOG_INPUT,
  id: "airline.chat.studio.components",
  components: AIRLINE_STUDIO_CATALOG_INPUT.components.map((component) =>
    component.ref === AIRLINE_STUDIO_COMPONENTS.extrasSelector
      || component.ref === AIRLINE_STUDIO_COMPONENTS.bookingReview
      ? Object.freeze({
          ...component,
          events: Object.freeze([...component.events, assistantCommandEvent]),
        })
      : component),
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

function documentFor(result: ViraFlightExperienceResult): StudioAuthoringDocumentInput {
  const views: AuthoredView[] = [];
  const bindings: AuthoredBinding[] = [];
  const interactions: AuthoredInteraction[] = [];

  for (let index = 0; index < STEPS.length; index += 1) {
    const step = STEPS[index];
    const source = createAirlineStarterDocument(`chat.segment.${step}`, step);
    const view = source.views[0];
    const node = view?.nodes[0];
    if (!view || !node) throw new Error(`Missing airline Studio starter: ${step}`);
    const next = STEPS[index + 1] ?? "confirmation";
    const id = `${step}-root`;
    const props: Record<string, unknown> = { ...node.props };
    if (step === "flight-search") {
      props.origin = result.input.origin;
      props.destination = result.input.destination;
      props.departure = result.input.departureDate;
      props.passengers = result.input.passengers;
    } else if (step === "flight-results") {
      const first = result.data.offers[0];
      props.origin = result.input.origin;
      props.destination = result.input.destination;
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

function AirlineWidget({ component, props, emit }: {
  readonly component: string;
  readonly props: Readonly<Record<string, unknown>>;
  readonly emit: (event: string, payload?: unknown) => unknown;
}): ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!ref.current) return undefined;
    return mountAirlineStudioComponent(ref.current, component, props, (event, payload) => { emit(event, payload); });
  }, [component, props, emit]);
  return <div ref={ref} className="shared-brand-runtime" />;
}

const renderers: Readonly<Record<string, StudioRuntimeReactRenderer>> = Object.freeze(Object.fromEntries(
  Object.values(AIRLINE_STUDIO_COMPONENTS).map((component) => [
    component,
    ({ props, emit }: Parameters<StudioRuntimeReactRenderer>[0]) => createElement(AirlineWidget, { component, props, emit }),
  ]),
));

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}

interface CanonicalChatRuntimeBundle {
  readonly runtime: ViraExperienceRuntime;
  readonly offers: () => readonly FlightOffer[];
}

function createRuntime(result: ViraFlightExperienceResult): CanonicalChatRuntimeBundle | undefined {
  const state = runtimeState();
  if (!state) return undefined;
  const publication = prepareAuthoredStudioPublication({
    document: documentFor(result),
    componentCatalog,
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
    componentCatalog,
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

export function CanonicalStudioFlightExperience({ result }: { readonly result: ViraFlightExperienceResult }) {
  const bundle = useMemo(() => createRuntime(result), [result]);
  const [, setRevision] = useState(0);
  useEffect(() => {
    if (!bundle) return undefined;
    const unregisterCommandTarget = registerCanonicalChatCommandTarget({
      runtime: bundle.runtime,
      offers: bundle.offers,
    });
    const unsubscribe = bundle.runtime.subscribe(() => { setRevision((value) => value + 1); });
    return () => {
      unregisterCommandTarget();
      unsubscribe();
      bundle.runtime.dispose();
    };
  }, [bundle]);

  if (!bundle) return <div className="flight-error">Vira could not load the approved GenUI publication.</div>;
  const rendered = bundle.runtime.renderReact({ renderers });
  if (!rendered.ok) return <div className="flight-error">Vira stopped this GenUI experience safely.</div>;
  return <div className="vira-experience" aria-label="Approved interactive flight booking">{rendered.value}</div>;
}

export const APPROVED_CHAT_EXPERIENCE_ID = "pegasus.chat.approved-booking" as const;
export const APPROVED_CHAT_STUDIO_TEMPLATES = AIRLINE_STARTER_TEMPLATES;
