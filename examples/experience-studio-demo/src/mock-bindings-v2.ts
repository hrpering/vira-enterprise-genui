import {
  AIRLINE_GUIDANCE_STUDIO_COMPONENTS,
  AIRLINE_STUDIO_COMPONENTS,
} from "@vira-enterprise-genui/airline-brand-kit";
import {
  DEFAULT_MOCK_RUNTIME_INPUT,
  createMockAirlineRuntimeData,
} from "@vira-enterprise-genui/mock-airline-domain";
import { createMockAirlineStudioCollectionData } from "@vira-enterprise-genui/mock-airline-domain/studio-collections";
import type { StudioBindingSourceDefinition } from "@vira-enterprise-genui/studio-binding";
import type {
  StudioBinding,
  StudioExperienceDocument,
  StudioNode,
} from "@vira-enterprise-genui/studio-schema";

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
  { kind: "domain", path: "results.offers", label: "Results · flight offers", valueType: "array" },

  { kind: "scope", path: "currentItem.id", label: "Current offer · id", valueType: "string" },
  { kind: "scope", path: "currentItem.carrier", label: "Current offer · carrier", valueType: "string" },
  { kind: "scope", path: "currentItem.flight-number", label: "Current offer · flight number", valueType: "string" },
  { kind: "scope", path: "currentItem.route", label: "Current offer · route", valueType: "string" },
  { kind: "scope", path: "currentItem.schedule", label: "Current offer · schedule", valueType: "string" },
  { kind: "scope", path: "currentItem.duration-label", label: "Current offer · duration", valueType: "string" },
  { kind: "scope", path: "currentItem.price", label: "Current offer · price", valueType: "number" },
  { kind: "scope", path: "currentItem.currency", label: "Current offer · currency", valueType: "string" },
  { kind: "scope", path: "currentItem.remaining-seats", label: "Current offer · remaining seats", valueType: "number" },
  { kind: "scope", path: "currentItem.remaining-seats-label", label: "Current offer · remaining seats label", valueType: "string" },

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

const MOCK_AUTHORING_RUNTIME_DATA: Readonly<Record<string, unknown>> = Object.freeze({
  ...createMockAirlineRuntimeData(DEFAULT_MOCK_RUNTIME_INPUT),
  ...createMockAirlineStudioCollectionData(DEFAULT_MOCK_RUNTIME_INPUT),
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

function scopeValue(item: unknown, path: string): unknown {
  if (!path.startsWith("currentItem.")) return undefined;
  let current: unknown = item;
  for (const segment of path.slice("currentItem.".length).split(".")) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Readonly<Record<string, unknown>>)[segment];
  }
  return current;
}

function repeatOwner(
  document: StudioExperienceDocument,
  viewId: string,
  nodeId: string,
): StudioNode | undefined {
  const view = document.views.find((candidate) => candidate.id === viewId);
  if (!view) return undefined;
  const byId = new Map(view.nodes.map((node) => [node.id, node] as const));
  const seen = new Set<string>();
  let current = byId.get(nodeId);
  while (current && !seen.has(current.id)) {
    if (current.repeat) return current;
    seen.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return undefined;
}

function previewScopeItem(
  document: StudioExperienceDocument,
  viewId: string,
  nodeId: string,
): unknown {
  const owner = repeatOwner(document, viewId, nodeId);
  if (!owner?.repeat || owner.repeat.source.kind !== "domain") return undefined;
  const collection = MOCK_AUTHORING_RUNTIME_DATA[owner.repeat.source.path];
  return Array.isArray(collection) ? collection[0] : undefined;
}

export function resolveMockDomainPreviewProps(
  document: StudioExperienceDocument,
  viewId: string,
  nodeId: string,
  props: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const resolved: Record<string, unknown> = { ...props };
  const scopeItem = previewScopeItem(document, viewId, nodeId);
  for (const binding of document.bindings) {
    if (binding.viewId !== viewId || binding.nodeId !== nodeId) continue;
    const value = binding.source.kind === "domain"
      ? MOCK_AUTHORING_RUNTIME_DATA[binding.source.path]
      : binding.source.kind === "scope"
        ? scopeValue(scopeItem, binding.source.path)
        : undefined;
    if (value !== undefined) resolved[binding.prop] = value;
  }
  return resolved;
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

  return { ...document, views, bindings } as StudioExperienceDocument;
}
