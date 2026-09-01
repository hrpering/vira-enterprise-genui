import {
  AIRLINE_GUIDANCE_STUDIO_COMPONENTS,
  AIRLINE_STUDIO_COMPONENTS,
  mountAirlineGuidanceStudioComponent,
  mountAirlineStudioComponent,
} from "@vira-enterprise-genui/airline-brand-kit";
import {
  AIRLINE_STARTER_TEMPLATES,
  AIRLINE_STUDIO_CATALOG_INPUT,
  airlineStarterProps,
  createAirlineStarterDocument,
} from "@vira-enterprise-genui/airline-brand-kit/studio";
import {
  DEFAULT_MOCK_RUNTIME_INPUT,
  createMockAirlineRuntimeData,
} from "@vira-enterprise-genui/mock-airline-domain";
import { createMockAirlineStudioCollectionData } from "@vira-enterprise-genui/mock-airline-domain/studio-collections";
import { createStudioDesignCatalog } from "@vira-enterprise-genui/studio-design";
import type { StudioRuntimeReactRenderer } from "@vira-enterprise-genui/studio-runtime-react";
import type {
  StudioBinding,
  StudioExperienceDocument,
  StudioInteraction,
  StudioNode,
} from "@vira-enterprise-genui/studio-schema";
import { createElement, useLayoutEffect, useRef } from "react";
import type { ComponentType, ReactElement, ReactNode } from "react";
import { mockBindingSourceCatalog } from "./mock-bindings.js";

const OFFER_BUTTON = "airline.component.offer-button" as const;

const guidanceComponents = [
  {
    ref: AIRLINE_GUIDANCE_STUDIO_COMPONENTS.specialAssistance,
    label: "Special assistance",
    category: "guidance",
    kind: "input",
    props: [
      { key: "summary", type: "string", required: true, bindable: true },
      { key: "deadline", type: "string", required: true, bindable: true },
    ],
    slots: [],
    events: [
      { name: "select", label: "Assistance selected" },
      { name: "continue", label: "Continue" },
    ],
  },
  {
    ref: AIRLINE_GUIDANCE_STUDIO_COMPONENTS.missedFlight,
    label: "Missed flight",
    category: "guidance",
    kind: "input",
    props: [
      { key: "summary", type: "string", required: true, bindable: true },
      { key: "next-action", type: "string", required: true, bindable: true },
    ],
    slots: [],
    events: [
      { name: "select", label: "Scenario selected" },
      { name: "continue", label: "Continue" },
    ],
  },
  {
    ref: AIRLINE_GUIDANCE_STUDIO_COMPONENTS.visaCheck,
    label: "Visa check",
    category: "guidance",
    kind: "input",
    props: [
      { key: "origin-country", type: "string", required: true, bindable: true },
      { key: "destination-country", type: "string", required: true, bindable: true },
      { key: "summary", type: "string", required: true, bindable: true },
    ],
    slots: [],
    events: [
      { name: "submit", label: "Profile submitted" },
      { name: "continue", label: "Continue" },
    ],
  },
] as const;

const genericComponents = [
  {
    ref: "airline.layout.stack",
    label: "Stack",
    category: "layout",
    kind: "layout",
    props: [],
    slots: [{ name: "content", label: "Content" }],
    events: [],
  },
  {
    ref: "airline.layout.row",
    label: "Row",
    category: "layout",
    kind: "layout",
    props: [],
    slots: [{ name: "content", label: "Content" }],
    events: [],
  },
  {
    ref: "airline.layout.grid",
    label: "Grid",
    category: "layout",
    kind: "layout",
    props: [{ key: "columns", type: "enum", required: true, bindable: false, options: ["2", "3"] }],
    slots: [{ name: "content", label: "Content" }],
    events: [],
  },
  {
    ref: "airline.layout.card",
    label: "Card",
    category: "layout",
    kind: "layout",
    props: [{ key: "variant", type: "enum", required: true, bindable: false, options: ["default", "accent", "subtle"] }],
    slots: [{ name: "content", label: "Content" }],
    events: [],
  },
  {
    ref: "airline.component.heading",
    label: "Heading",
    category: "content",
    kind: "content",
    props: [{ key: "text", type: "string", required: true, bindable: true }],
    slots: [],
    events: [],
  },
  {
    ref: "airline.component.text",
    label: "Text",
    category: "content",
    kind: "content",
    props: [{ key: "text", type: "string", required: true, bindable: true }],
    slots: [],
    events: [],
  },
  {
    ref: "airline.component.button",
    label: "Button",
    category: "action",
    kind: "action",
    props: [
      { key: "label", type: "string", required: true, bindable: true },
      { key: "variant", type: "enum", required: true, bindable: false, options: ["primary", "secondary", "ghost"] },
    ],
    slots: [],
    events: [{ name: "press", label: "Pressed" }],
  },
  {
    ref: OFFER_BUTTON,
    label: "Choose flight button",
    category: "flight.action",
    kind: "action",
    props: [
      { key: "label", type: "string", required: true, bindable: true },
      { key: "variant", type: "enum", required: true, bindable: false, options: ["primary", "secondary", "ghost"] },
    ],
    slots: [],
    events: [{
      name: "press",
      label: "Flight selected",
      payload: [{ key: "offerId", type: "string", required: true }],
    }],
  },
  {
    ref: "airline.component.badge",
    label: "Badge",
    category: "content",
    kind: "content",
    props: [
      { key: "text", type: "string", required: true, bindable: true },
      { key: "tone", type: "enum", required: true, bindable: false, options: ["neutral", "accent", "success", "warning"] },
    ],
    slots: [],
    events: [],
  },
  {
    ref: "airline.component.price",
    label: "Price",
    category: "content",
    kind: "content",
    props: [
      { key: "amount", type: "number", required: true, bindable: true },
      { key: "currency", type: "string", required: true, bindable: true },
    ],
    slots: [],
    events: [],
  },
  {
    ref: "airline.component.divider",
    label: "Divider",
    category: "content",
    kind: "content",
    props: [],
    slots: [],
    events: [],
  },
] as const;

export const baseComponentCatalogInput = Object.freeze({
  version: "1" as const,
  id: "airline.studio.components",
  brandId: "airline.brand",
  components: Object.freeze([
    ...genericComponents,
    ...AIRLINE_STUDIO_CATALOG_INPUT.components,
    ...guidanceComponents,
  ]),
});

const styledCatalog = createStudioDesignCatalog(baseComponentCatalogInput, {
  colorMode: "any",
  fonts: ["Inter", "Arial", "Georgia"],
  allowGradient: true,
  shadows: ["none", "sm", "md", "lg", "xl"],
  layouts: ["block", "row", "column", "grid2", "grid3"],
});
if (!styledCatalog.ok) throw new Error(styledCatalog.issue.message);
export const componentCatalog = styledCatalog.value;
export const bindingSourceCatalog = mockBindingSourceCatalog;

export const actionAdapter = {
  version: "1",
  id: "airline.studio.actions",
  mappings: [
    { event: "flight.search.submit", actionType: "travel.flight.search.submit" },
    { event: "flight.offer.select", actionType: "travel.flight.offer.select" },
    { event: "flight.fare.select", actionType: "travel.flight.fare.select" },
    { event: "flight.passenger.submit", actionType: "travel.flight.passenger.submit" },
    { event: "flight.seat.select", actionType: "travel.flight.seat.select" },
    { event: "flight.baggage.select", actionType: "travel.flight.baggage.select" },
    { event: "flight.extras.submit", actionType: "travel.flight.extras.submit" },
    { event: "flight.booking.handoff", actionType: "travel.flight.booking.handoff" },
    { event: "guidance.assistance.select", actionType: "travel.guidance.assistance.select" },
    { event: "guidance.policy.select", actionType: "travel.guidance.policy.select" },
    { event: "guidance.visa.submit", actionType: "travel.guidance.visa.submit" },
    { event: "guidance.handoff", actionType: "travel.guidance.handoff" },
  ],
};

const allowedActions = [
  "travel.flight.search.submit",
  "travel.flight.offer.select",
  "travel.flight.fare.select",
  "travel.flight.passenger.submit",
  "travel.flight.seat.select",
  "travel.flight.baggage.select",
  "travel.flight.extras.submit",
  "travel.flight.booking.handoff",
  "travel.guidance.assistance.select",
  "travel.guidance.policy.select",
  "travel.guidance.visa.submit",
  "travel.guidance.handoff",
  "runtime.patch.apply",
] as const;

export const runtimePermissionPolicy = {
  version: "1",
  rules: allowedActions.map((id) => ({ subject: "action" as const, id, effect: "allow" as const })),
} as const;

const starterTemplatesBase = [
  ...AIRLINE_STARTER_TEMPLATES,
  { id: "special-assistance", label: "Special assistance", description: "Wheelchair and reduced-mobility assistance flow.", component: AIRLINE_GUIDANCE_STUDIO_COMPONENTS.specialAssistance },
  { id: "missed-flight", label: "Missed flight", description: "No-show and missed-flight recovery options.", component: AIRLINE_GUIDANCE_STUDIO_COMPONENTS.missedFlight },
  { id: "visa-check", label: "Visa check", description: "Country and nationality-aware visa guidance flow.", component: AIRLINE_GUIDANCE_STUDIO_COMPONENTS.visaCheck },
] as const;

export const starterTemplates = Object.freeze(starterTemplatesBase);
export type StarterTemplateId = (typeof starterTemplatesBase)[number]["id"];

const defaultRuntimeData = createMockAirlineRuntimeData(DEFAULT_MOCK_RUNTIME_INPUT);
const collectionRuntimeData = createMockAirlineStudioCollectionData(DEFAULT_MOCK_RUNTIME_INPUT);

function domainValue(path: string): unknown {
  return path in collectionRuntimeData ? collectionRuntimeData[path] : defaultRuntimeData[path];
}

function starterProps(template: StarterTemplateId): Readonly<Record<string, string | number>> {
  if (template === "special-assistance") {
    return {
      summary: String(domainValue("guidance.special-assistance.summary") ?? "Assistance can be requested."),
      deadline: String(domainValue("guidance.special-assistance.deadline") ?? "Request before departure."),
    };
  }
  if (template === "missed-flight") {
    return {
      summary: String(domainValue("guidance.missed-flight.summary") ?? "Your options depend on fare conditions."),
      "next-action": String(domainValue("guidance.missed-flight.next-action") ?? "Check the next available flight."),
    };
  }
  if (template === "visa-check") {
    return {
      "origin-country": String(domainValue("guidance.visa.origin-country") ?? "Türkiye"),
      "destination-country": String(domainValue("guidance.visa.destination-country") ?? "Germany"),
      summary: String(domainValue("guidance.visa.summary") ?? "Check entry requirements before travel."),
    };
  }
  return airlineStarterProps(template);
}

function singleNodeStarter(experienceId: string, template: StarterTemplateId): StudioExperienceDocument {
  if (template in Object.fromEntries(AIRLINE_STARTER_TEMPLATES.map((item) => [item.id, true]))) {
    return createAirlineStarterDocument(experienceId, template as Parameters<typeof createAirlineStarterDocument>[1]);
  }
  const definition = starterTemplates.find((candidate) => candidate.id === template);
  if (!definition) throw new Error(`Unknown starter template: ${template}`);
  const node: StudioNode = {
    id: "root",
    component: definition.component,
    order: 0,
    props: { ...starterProps(template) },
  };
  const interaction: StudioInteraction | undefined = template === "special-assistance"
    ? { viewId: "main", nodeId: "root", event: "select", actionEvent: "guidance.assistance.select", routes: [] }
    : template === "missed-flight"
      ? { viewId: "main", nodeId: "root", event: "select", actionEvent: "guidance.policy.select", routes: [] }
      : template === "visa-check"
        ? { viewId: "main", nodeId: "root", event: "submit", actionEvent: "guidance.visa.submit", routes: [] }
        : undefined;
  return {
    version: "1",
    id: experienceId,
    recipeId: `studio.airline.${experienceId.replaceAll(".", "-")}`,
    entryView: "main",
    views: [{ id: "main", nodes: [node] }],
    bindings: [],
    interactions: interaction ? [interaction] : [],
  };
}

export function createStarterDocument(experienceId: string, template: StarterTemplateId): StudioExperienceDocument {
  return singleNodeStarter(experienceId, template);
}

function RuntimeHost({ component, props, emit }: { component: string; props: Readonly<Record<string, unknown>>; emit: (event: string, payload?: unknown) => void }): ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!ref.current) return undefined;
    if (component in AIRLINE_STUDIO_COMPONENTS || Object.values(AIRLINE_STUDIO_COMPONENTS).includes(component as typeof AIRLINE_STUDIO_COMPONENTS[keyof typeof AIRLINE_STUDIO_COMPONENTS])) {
      return mountAirlineStudioComponent(ref.current, component, props, emit);
    }
    return mountAirlineGuidanceStudioComponent(ref.current, component, props, emit);
  }, [component, props, emit]);
  return createElement("div", { ref });
}

function passthroughRuntimeRenderer(component: string): StudioRuntimeReactRenderer {
  return ({ props, emit }) => createElement(RuntimeHost, { component, props, emit: (event, payload) => { emit(event, payload); } });
}

export const runtimeRenderers: Readonly<Record<string, StudioRuntimeReactRenderer>> = Object.freeze(Object.fromEntries(
  componentCatalog.components.map((component) => [component.ref, passthroughRuntimeRenderer(component.ref)]),
));

function WorkbenchText({ children }: { children: ReactNode }): ReactElement {
  return createElement("div", { style: { padding: 12, border: "1px solid #d1d5db", borderRadius: 8, background: "#fff" } }, children);
}

const simpleWorkbenchRenderers: Readonly<Record<string, ComponentType<Record<string, unknown>>>> = Object.freeze({
  "airline.layout.stack": ({ children }) => createElement("div", { style: { display: "flex", flexDirection: "column", gap: 12 } }, children as ReactNode),
  "airline.layout.row": ({ children }) => createElement("div", { style: { display: "flex", gap: 12, alignItems: "center" } }, children as ReactNode),
  "airline.layout.grid": ({ children, columns }) => createElement("div", { style: { display: "grid", gridTemplateColumns: `repeat(${columns === "3" ? 3 : 2}, minmax(0, 1fr))`, gap: 12 } }, children as ReactNode),
  "airline.layout.card": ({ children, variant }) => createElement("section", { style: { padding: 16, border: "1px solid #d1d5db", borderRadius: 12, background: variant === "accent" ? "#fff7ed" : variant === "subtle" ? "#f8fafc" : "#fff" } }, children as ReactNode),
  "airline.component.heading": ({ text }) => createElement("h3", { style: { margin: 0 } }, String(text ?? "Heading")),
  "airline.component.text": ({ text }) => createElement("p", { style: { margin: 0 } }, String(text ?? "Text")),
  "airline.component.button": ({ label }) => createElement("button", { type: "button" }, String(label ?? "Action")),
  [OFFER_BUTTON]: ({ label }) => createElement("button", { type: "button" }, String(label ?? "Choose flight")),
  "airline.component.badge": ({ text }) => createElement("span", null, String(text ?? "Badge")),
  "airline.component.price": ({ amount, currency }) => createElement(WorkbenchText, null, `${String(amount ?? 0)} ${String(currency ?? "EUR")}`),
  "airline.component.divider": () => createElement("hr"),
});

function StudioHost({ component, props, events }: { component: string; props: Readonly<Record<string, unknown>>; events: Readonly<Record<string, (...args: unknown[]) => void>> }): ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!ref.current) return undefined;
    if (Object.values(AIRLINE_STUDIO_COMPONENTS).includes(component as typeof AIRLINE_STUDIO_COMPONENTS[keyof typeof AIRLINE_STUDIO_COMPONENTS])) {
      return mountAirlineStudioComponent(ref.current, component, props, (event, payload) => events[event]?.(payload));
    }
    if (Object.values(AIRLINE_GUIDANCE_STUDIO_COMPONENTS).includes(component as typeof AIRLINE_GUIDANCE_STUDIO_COMPONENTS[keyof typeof AIRLINE_GUIDANCE_STUDIO_COMPONENTS])) {
      return mountAirlineGuidanceStudioComponent(ref.current, component, props, (event, payload) => events[event]?.(payload));
    }
    return undefined;
  }, [component, props, events]);
  return createElement("div", { ref });
}

export const workbenchRenderers: Readonly<Record<string, ComponentType<Record<string, unknown>>>> = Object.freeze(Object.fromEntries(
  componentCatalog.components.map((component) => [component.ref,
    simpleWorkbenchRenderers[component.ref]
      ?? ((props: Record<string, unknown>) => {
        const eventMap = Object.fromEntries(component.events.map((event) => [event.name, (...args: unknown[]) => { void args; }]));
        return createElement(StudioHost, { component: component.ref, props, events: eventMap });
      }),
  ]),
));

export function starterPreview(template: StarterTemplateId): ReactElement {
  const definition = starterTemplates.find((candidate) => candidate.id === template);
  if (!definition) throw new Error(`Unknown starter template: ${template}`);
  const renderer = workbenchRenderers[definition.component];
  if (!renderer) throw new Error(`Missing workbench renderer for starter template: ${template}`);
  return createElement(renderer, { ...starterProps(template) });
}
