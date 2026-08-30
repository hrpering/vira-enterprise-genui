import { AIRLINE_GUIDANCE_STUDIO_COMPONENTS, AIRLINE_STUDIO_COMPONENTS } from "@vira-enterprise-genui/airline-brand-kit";
import type { StudioBindingSourceDefinition } from "@vira-enterprise-genui/studio-binding";
import type { StudioExperienceDocument, StudioBinding } from "@vira-enterprise-genui/studio-schema";

export const MOCK_BINDING_SOURCES = Object.freeze([
  { kind: "domain", path: "search.origin", label: "Search · origin", valueType: "string" },
  { kind: "domain", path: "search.destination", label: "Search · destination", valueType: "string" },
  { kind: "domain", path: "search.departure", label: "Search · departure date", valueType: "string" },
  { kind: "domain", path: "search.passengers", label: "Search · passengers", valueType: "number" },

  { kind: "domain", path: "results.origin", label: "Results · origin", valueType: "string" },
  { kind: "domain", path: "results.destination", label: "Results · destination", valueType: "string" },
  { kind: "domain", path: "results.passengers", label: "Results · passengers", valueType: "number" },
  { kind: "domain", path: "results.base-price", label: "Results · cheapest trip price", valueType: "number" },
  { kind: "domain", path: "results.currency", label: "Results · currency", valueType: "string" },

  { kind: "domain", path: "booking.passengers", label: "Booking · passengers", valueType: "number" },
  { kind: "domain", path: "booking.fare", label: "Booking · selected fare", valueType: "enum" },

  { kind: "domain", path: "review.origin", label: "Review · origin", valueType: "string" },
  { kind: "domain", path: "review.destination", label: "Review · destination", valueType: "string" },
  { kind: "domain", path: "review.passengers", label: "Review · passengers", valueType: "number" },
  { kind: "domain", path: "review.fare", label: "Review · selected fare", valueType: "enum" },
  { kind: "domain", path: "review.base-price", label: "Review · base trip price", valueType: "number" },
  { kind: "domain", path: "review.currency", label: "Review · currency", valueType: "string" },

  { kind: "domain", path: "guidance.special-assistance.summary", label: "Guidance · assistance summary", valueType: "string" },
  { kind: "domain", path: "guidance.special-assistance.deadline", label: "Guidance · assistance deadline", valueType: "string" },
  { kind: "domain", path: "guidance.missed-flight.summary", label: "Guidance · missed-flight summary", valueType: "string" },
  { kind: "domain", path: "guidance.missed-flight.next-action", label: "Guidance · missed-flight next action", valueType: "string" },
  { kind: "domain", path: "guidance.visa.origin-country", label: "Guidance · origin country", valueType: "string" },
  { kind: "domain", path: "guidance.visa.destination-country", label: "Guidance · destination country", valueType: "string" },
  { kind: "domain", path: "guidance.visa.summary", label: "Guidance · visa summary", valueType: "string" },
] satisfies readonly StudioBindingSourceDefinition[]);

export const mockBindingSourceCatalog = Object.freeze({
  version: "1" as const,
  id: "airline.studio.data",
  sources: MOCK_BINDING_SOURCES,
});

type ComponentBindingMap = Readonly<Record<string, Readonly<Record<string, string>>>>;

const componentBindings: ComponentBindingMap = Object.freeze({
  [AIRLINE_STUDIO_COMPONENTS.flightSearch]: Object.freeze({
    origin: "search.origin",
    destination: "search.destination",
    departure: "search.departure",
    passengers: "search.passengers",
  }),
  [AIRLINE_STUDIO_COMPONENTS.flightResults]: Object.freeze({
    origin: "results.origin",
    destination: "results.destination",
    passengers: "results.passengers",
    "base-price": "results.base-price",
    currency: "results.currency",
  }),
  [AIRLINE_STUDIO_COMPONENTS.fareComparison]: Object.freeze({
    "base-price": "results.base-price",
    currency: "results.currency",
    passengers: "booking.passengers",
  }),
  [AIRLINE_STUDIO_COMPONENTS.travellerDetails]: Object.freeze({
    passengers: "booking.passengers",
  }),
  [AIRLINE_STUDIO_COMPONENTS.seatMap]: Object.freeze({
    passengers: "booking.passengers",
    fare: "booking.fare",
  }),
  [AIRLINE_STUDIO_COMPONENTS.baggageSelector]: Object.freeze({
    passengers: "booking.passengers",
    fare: "booking.fare",
  }),
  [AIRLINE_STUDIO_COMPONENTS.extrasSelector]: Object.freeze({
    passengers: "booking.passengers",
    fare: "booking.fare",
  }),
  [AIRLINE_STUDIO_COMPONENTS.bookingReview]: Object.freeze({
    origin: "review.origin",
    destination: "review.destination",
    passengers: "review.passengers",
    fare: "review.fare",
    "base-price": "review.base-price",
    currency: "review.currency",
  }),
  [AIRLINE_GUIDANCE_STUDIO_COMPONENTS.specialAssistance]: Object.freeze({
    summary: "guidance.special-assistance.summary",
    deadline: "guidance.special-assistance.deadline",
  }),
  [AIRLINE_GUIDANCE_STUDIO_COMPONENTS.missedFlight]: Object.freeze({
    summary: "guidance.missed-flight.summary",
    "next-action": "guidance.missed-flight.next-action",
  }),
  [AIRLINE_GUIDANCE_STUDIO_COMPONENTS.visaCheck]: Object.freeze({
    "origin-country": "guidance.visa.origin-country",
    "destination-country": "guidance.visa.destination-country",
    summary: "guidance.visa.summary",
  }),
});

function bindingKey(binding: StudioBinding): string {
  return `${binding.viewId}\u0000${binding.nodeId}\u0000${binding.prop}`;
}

export function applyMockDomainBindings(document: StudioExperienceDocument): StudioExperienceDocument {
  const existing = new Set(document.bindings.map(bindingKey));
  const bindings: StudioBinding[] = [...document.bindings];
  const views = document.views.map((view) => ({
    ...view,
    nodes: view.nodes.map((node) => {
      const mapping = componentBindings[node.component];
      if (!mapping) return node;

      const props: Record<string, unknown> = { ...node.props };
      for (const [prop, path] of Object.entries(mapping)) {
        const key = `${view.id}\u0000${node.id}\u0000${prop}`;
        if (!existing.has(key)) {
          bindings.push({
            viewId: view.id,
            nodeId: node.id,
            prop,
            source: { kind: "domain", path },
          });
          existing.add(key);
        }
        delete props[prop];
      }
      return { ...node, props };
    }),
  }));

  return {
    ...document,
    views,
    bindings,
  } as StudioExperienceDocument;
}
