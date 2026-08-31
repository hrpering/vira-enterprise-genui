"use client";

import {
  AIRLINE_STUDIO_COMPONENTS,
  mountAirlineStudioComponent,
} from "@vira-enterprise-genui/airline-brand-kit";
import {
  AIRLINE_STARTER_TEMPLATES,
  AIRLINE_STUDIO_CATALOG_INPUT,
  createAirlineStarterDocument,
} from "@vira-enterprise-genui/airline-brand-kit/studio";
import {
  createViraExperienceRuntime,
  prepareAuthoredStudioPublication,
  type StudioRuntimeReactRenderer,
  type ViraExperienceRuntime,
} from "@vira-enterprise-genui/genui";
import { createRuntimeState } from "@vira-enterprise-genui/runtime-core";
import { createElement, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
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
  ],
} as const;

const bindingSourceCatalog = {
  version: "1",
  id: "airline.chat.studio.data",
  sources: [],
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

function documentFor(result: ViraFlightExperienceResult) {
  const views: Array<{ id: string; nodes: readonly unknown[] }> = [];
  const interactions: unknown[] = [];

  for (let index = 0; index < STEPS.length; index += 1) {
    const step = STEPS[index];
    const source = createAirlineStarterDocument(`chat.segment.${step}`, step);
    const view = source.views[0];
    const node = view?.nodes[0];
    if (!view || !node) throw new Error(`Missing airline Studio starter: ${step}`);
    const next = STEPS[index + 1] ?? "confirmation";
    const id = `${step}-root`;
    let props = node.props;
    if (step === "flight-search") {
      props = {
        ...props,
        origin: result.input.origin,
        destination: result.input.destination,
        departure: result.input.departureDate,
        passengers: result.input.passengers,
      };
    } else if (step === "flight-results") {
      const first = result.data.offers[0];
      props = {
        ...props,
        origin: result.input.origin,
        destination: result.input.destination,
        passengers: result.input.passengers,
        "base-price": first?.price ?? 0,
        currency: first?.currency ?? "EUR",
      };
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
    bindings: [],
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

function createRuntime(result: ViraFlightExperienceResult): ViraExperienceRuntime | undefined {
  const state = runtimeState();
  if (!state) return undefined;
  const publication = prepareAuthoredStudioPublication({
    document: documentFor(result) as never,
    componentCatalog: AIRLINE_STUDIO_CATALOG_INPUT,
    bindingSourceCatalog,
    actionAdapter,
  });
  if (!publication.ok) return undefined;

  let revision = 1;
  const host = {
    version: "1",
    id: "pegasus.chat.approved-host",
    snapshot: () => ({ version: "1", revision, state: {}, domain: {} }),
    dispatch: async () => {
      revision += 1;
      return { outcome: "success", snapshot: { version: "1", revision, state: {}, domain: {} } };
    },
    subscribe: () => () => {},
  };
  const runtime = createViraExperienceRuntime({
    publication: publication.value,
    componentCatalog: AIRLINE_STUDIO_CATALOG_INPUT,
    bindingSourceCatalog,
    actionAdapter,
    runtimeState: state,
    permissionPolicy,
    host,
  });
  return runtime.ok ? runtime.value : undefined;
}

export function CanonicalStudioFlightExperience({ result }: { readonly result: ViraFlightExperienceResult }) {
  const runtime = useMemo(() => createRuntime(result), [result]);
  const [, setRevision] = useState(0);
  useEffect(() => () => { runtime?.dispose(); }, [runtime]);

  if (!runtime) return <div className="flight-error">Vira could not load the approved GenUI publication.</div>;
  const rendered = runtime.renderReact({
    renderers,
    onHostResult: () => { setRevision((value) => value + 1); },
  });
  if (!rendered.ok) return <div className="flight-error">Vira stopped this GenUI experience safely.</div>;
  return <div className="vira-experience" aria-label="Approved interactive flight booking">{rendered.value}</div>;
}

export const APPROVED_CHAT_EXPERIENCE_ID = "pegasus.chat.approved-booking" as const;
export const APPROVED_CHAT_STUDIO_TEMPLATES = AIRLINE_STARTER_TEMPLATES;
