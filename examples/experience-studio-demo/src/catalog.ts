import {
  AIRLINE_STUDIO_COMPONENTS,
  mountAirlineStudioComponent,
} from "@vira-enterprise-genui/airline-brand-kit";
import {
  AIRLINE_STARTER_TEMPLATES,
  AIRLINE_STUDIO_CATALOG_INPUT,
  airlineStarterProps,
  createAirlineStarterDocument,
} from "@vira-enterprise-genui/airline-brand-kit/studio";
import type { AirlineStarterTemplateId } from "@vira-enterprise-genui/airline-brand-kit/studio";
import { createStudioDesignCatalog } from "@vira-enterprise-genui/studio-design";
import type { StudioRuntimeReactRenderer } from "@vira-enterprise-genui/studio-runtime-react";
import type { StudioExperienceDocument, StudioNode } from "@vira-enterprise-genui/studio-schema";
import { createElement, useLayoutEffect, useRef } from "react";
import type { ComponentType, ReactElement, ReactNode } from "react";

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
    ref: "airline.component.heading",
    label: "Heading",
    category: "content",
    kind: "content",
    props: [{ key: "text", type: "string", required: true, bindable: false }],
    slots: [],
    events: [],
  },
  {
    ref: "airline.component.text",
    label: "Text",
    category: "content",
    kind: "content",
    props: [{ key: "text", type: "string", required: true, bindable: false }],
    slots: [],
    events: [],
  },
  {
    ref: "airline.component.special-assistance",
    label: "Special assistance",
    category: "guidance",
    kind: "content",
    props: [
      { key: "summary", type: "string", required: true, bindable: false },
      { key: "deadline", type: "string", required: true, bindable: false },
    ],
    slots: [],
    events: [],
  },
  {
    ref: "airline.component.missed-flight",
    label: "Missed flight",
    category: "guidance",
    kind: "content",
    props: [
      { key: "summary", type: "string", required: true, bindable: false },
      { key: "next-action", type: "string", required: true, bindable: false },
    ],
    slots: [],
    events: [],
  },
  {
    ref: "airline.component.visa-check",
    label: "Visa check",
    category: "guidance",
    kind: "content",
    props: [
      { key: "origin-country", type: "string", required: true, bindable: false },
      { key: "destination-country", type: "string", required: true, bindable: false },
      { key: "summary", type: "string", required: true, bindable: false },
    ],
    slots: [],
    events: [],
  },
] as const;

const baseCatalog = {
  version: "1",
  id: "airline.studio.components",
  brandId: "airline.brand",
  components: [...genericComponents, ...AIRLINE_STUDIO_CATALOG_INPUT.components],
};

const styledCatalog = createStudioDesignCatalog(baseCatalog, {
  colorMode: "any",
  fonts: ["Inter", "Arial", "Georgia"],
  allowGradient: true,
  shadows: ["none", "sm", "md", "lg", "xl"],
  layouts: ["block", "row", "column", "grid2", "grid3"],
});
if (!styledCatalog.ok) throw new Error(styledCatalog.issue.message);

export const componentCatalog = styledCatalog.value;

export const bindingSourceCatalog = {
  version: "1",
  id: "airline.studio.data",
  sources: [],
};

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
  ],
};

export const runtimePermissionPolicy = {
  version: "1",
  rules: [
    { subject: "action", id: "travel.flight.search.submit", effect: "allow" },
    { subject: "action", id: "travel.flight.offer.select", effect: "allow" },
    { subject: "action", id: "travel.flight.fare.select", effect: "allow" },
    { subject: "action", id: "travel.flight.passenger.submit", effect: "allow" },
    { subject: "action", id: "travel.flight.seat.select", effect: "allow" },
    { subject: "action", id: "travel.flight.baggage.select", effect: "allow" },
    { subject: "action", id: "travel.flight.extras.submit", effect: "allow" },
    { subject: "action", id: "travel.flight.booking.handoff", effect: "allow" },
    { subject: "action", id: "runtime.patch.apply", effect: "allow" },
  ],
} as const;

function textProp(props: Readonly<Record<string, unknown>>, key: string, fallback: string): string {
  const value = props[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

interface SharedAirlineHostProps {
  readonly component: string;
  readonly props: Readonly<Record<string, unknown>>;
  readonly emit?: (event: string, payload?: unknown) => void;
  readonly preview?: boolean;
}

function SharedAirlineHost({ component, props, emit, preview = false }: SharedAirlineHostProps): ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!ref.current) return undefined;
    return mountAirlineStudioComponent(ref.current, component, props, emit);
  }, [component, props, emit]);
  return createElement("div", { ref, className: preview ? "shared-brand-preview" : "shared-brand-runtime" });
}

function guidanceHeader(kicker: string, title: string, summary: string, chip: string): ReactNode {
  return createElement(
    "div",
    { className: "guidance-shell" },
    createElement("div", { className: "guidance-top" }, createElement("div", null, createElement("span", { className: "guidance-kicker" }, kicker), createElement("strong", null, title)), createElement("span", { className: "guidance-chip" }, chip)),
    createElement("p", { className: "guidance-summary" }, summary),
  );
}

function specialAssistance(props: Readonly<Record<string, unknown>>): ReactNode {
  const summary = textProp(props, "summary", "Choose the assistance level that best matches the passenger's mobility needs.");
  const deadline = textProp(props, "deadline", "Request as early as possible before departure");
  return createElement(
    "section",
    { className: "vira-guidance" },
    guidanceHeader("Special assistance", "Travel with mobility support", summary, "Action recommended"),
    createElement("div", { className: "guidance-highlight" }, createElement("span", null, "When to request"), createElement("strong", null, deadline)),
    createElement("div", { className: "guidance-choice-grid" },
      createElement("div", { className: "guidance-choice" }, createElement("b", null, "WCHR"), createElement("strong", null, "Ramp assistance"), createElement("span", null, "Passenger can use stairs and walk to the seat.")),
      createElement("div", { className: "guidance-choice" }, createElement("b", null, "WCHS"), createElement("strong", null, "Stair assistance"), createElement("span", null, "Passenger cannot use stairs but can walk to the seat.")),
      createElement("div", { className: "guidance-choice" }, createElement("b", null, "WCHC"), createElement("strong", null, "Cabin-seat assistance"), createElement("span", null, "Passenger needs assistance all the way to the seat."))),
  );
}

function missedFlight(props: Readonly<Record<string, unknown>>): ReactNode {
  return createElement(
    "section",
    { className: "vira-guidance" },
    guidanceHeader("Travel policy", "If you miss your flight", textProp(props, "summary", "What happens depends on when and where the journey is interrupted."), "Scenario guide"),
    createElement("div", { className: "guidance-tabs" }, createElement("span", { className: "active" }, "No-show"), createElement("span", null, "Connection"), createElement("span", null, "Airport delay")),
    createElement("div", { className: "guidance-policy-panel" }, createElement("strong", null, "If you do not board"), createElement("ul", null, createElement("li", null, "Your remaining itinerary may be affected by the fare rules."), createElement("li", null, "A new fare difference or service fee may apply.")), createElement("div", { className: "guidance-next" }, createElement("span", null, "Best next step"), createElement("strong", null, textProp(props, "next-action", "Check the fare rules before rebooking.")))),
  );
}

function visaCheck(props: Readonly<Record<string, unknown>>): ReactNode {
  const destination = textProp(props, "destination-country", "Germany");
  return createElement(
    "section",
    { className: "vira-guidance" },
    guidanceHeader("Entry requirements", `Check travel documents for ${destination}`, textProp(props, "summary", "Entry rules depend on the traveler's passport, nationality and residence status."), "Official check required"),
    createElement("div", { className: "guidance-route" }, createElement("span", null, "Travel"), createElement("strong", null, `${textProp(props, "origin-country", "Türkiye")} → ${destination}`)),
    createElement("button", { type: "button", className: "guidance-primary" }, "Check requirements"),
  );
}

function heading(props: Readonly<Record<string, unknown>>): ReactNode {
  return createElement("h1", { className: "demo-heading" }, textProp(props, "text", "Heading"));
}

function bodyText(props: Readonly<Record<string, unknown>>): ReactNode {
  return createElement("p", { className: "demo-text" }, textProp(props, "text", "Text"));
}

type SlotComponent = ComponentType<{ minEmptyHeight?: number }>;

const airlineWorkbenchRenderers = Object.fromEntries(Object.values(AIRLINE_STUDIO_COMPONENTS).map((component) => [
  component,
  ({ props }: { props: Readonly<Record<string, unknown>> }) => createElement(SharedAirlineHost, { component, props }),
]));

export const workbenchRenderers = {
  "airline.layout.stack": ({ props }: { props: Readonly<Record<string, unknown>> }) => {
    const Content = props.content as SlotComponent | undefined;
    return createElement("section", { className: "demo-stack" }, Content ? createElement(Content, { minEmptyHeight: 120 }) : null);
  },
  "airline.component.heading": ({ props }: { props: Readonly<Record<string, unknown>> }) => heading(props),
  "airline.component.text": ({ props }: { props: Readonly<Record<string, unknown>> }) => bodyText(props),
  "airline.component.special-assistance": ({ props }: { props: Readonly<Record<string, unknown>> }) => specialAssistance(props),
  "airline.component.missed-flight": ({ props }: { props: Readonly<Record<string, unknown>> }) => missedFlight(props),
  "airline.component.visa-check": ({ props }: { props: Readonly<Record<string, unknown>> }) => visaCheck(props),
  ...airlineWorkbenchRenderers,
};

const runtimeStack: StudioRuntimeReactRenderer = ({ slots }) => createElement("section", { className: "demo-stack" }, ...(slots.content ?? []));
const runtimeHeading: StudioRuntimeReactRenderer = ({ props }) => heading(props);
const runtimeText: StudioRuntimeReactRenderer = ({ props }) => bodyText(props);
const runtimeSpecial: StudioRuntimeReactRenderer = ({ props }) => specialAssistance(props);
const runtimeMissed: StudioRuntimeReactRenderer = ({ props }) => missedFlight(props);
const runtimeVisa: StudioRuntimeReactRenderer = ({ props }) => visaCheck(props);
const airlineRuntimeRenderers = Object.fromEntries(Object.values(AIRLINE_STUDIO_COMPONENTS).map((component) => [
  component,
  (({ props, emit }) => createElement(SharedAirlineHost, { component, props, emit: (event, payload) => { emit(event, payload); } })) satisfies StudioRuntimeReactRenderer,
]));

export const runtimeRenderers = {
  "airline.layout.stack": runtimeStack,
  "airline.component.heading": runtimeHeading,
  "airline.component.text": runtimeText,
  "airline.component.special-assistance": runtimeSpecial,
  "airline.component.missed-flight": runtimeMissed,
  "airline.component.visa-check": runtimeVisa,
  ...airlineRuntimeRenderers,
};

const guidanceTemplates = [
  { id: "special-assistance", label: "Special assistance", description: "Mobility and airport assistance guidance." },
  { id: "missed-flight", label: "Missed flight", description: "Scenario-based missed-flight policy experience." },
  { id: "visa-check", label: "Visa check", description: "Travel-document requirements experience." },
  { id: "blank", label: "Blank", description: "Start with an empty approved layout." },
] as const;

export const starterTemplates = Object.freeze([...AIRLINE_STARTER_TEMPLATES, ...guidanceTemplates]);
export type StarterTemplateId = (typeof starterTemplates)[number]["id"];

function guidanceDocument(experienceId: string, template: Exclude<StarterTemplateId, AirlineStarterTemplateId>): StudioExperienceDocument {
  let node: StudioNode;
  if (template === "special-assistance") {
    node = { id: "root", component: "airline.component.special-assistance", order: 0, props: { summary: "Choose the assistance level that best matches the passenger's mobility needs.", deadline: "Request as early as possible before departure" } };
  } else if (template === "missed-flight") {
    node = { id: "root", component: "airline.component.missed-flight", order: 0, props: { summary: "What happens depends on when and where the journey is interrupted.", "next-action": "Check the fare rules attached to the current ticket before rebooking." } };
  } else if (template === "visa-check") {
    node = { id: "root", component: "airline.component.visa-check", order: 0, props: { "origin-country": "Türkiye", "destination-country": "Germany", summary: "Entry rules depend on the traveler's passport, nationality and residence status." } };
  } else {
    node = { id: "root", component: "airline.layout.stack", order: 0, props: {} };
  }
  return { version: "1", id: experienceId, recipeId: `studio.demo.${experienceId.replaceAll(".", "-")}`, entryView: "main", views: [{ id: "main", nodes: [node] }], bindings: [], interactions: [] };
}

export function createStarterDocument(experienceId: string, template: StarterTemplateId): StudioExperienceDocument {
  const airline = AIRLINE_STARTER_TEMPLATES.find((candidate) => candidate.id === template);
  if (airline) return createAirlineStarterDocument(experienceId, airline.id);
  return guidanceDocument(experienceId, template as Exclude<StarterTemplateId, AirlineStarterTemplateId>);
}

export function starterPreview(template: StarterTemplateId): ReactElement {
  const airline = AIRLINE_STARTER_TEMPLATES.find((candidate) => candidate.id === template);
  if (airline) return createElement(SharedAirlineHost, { component: airline.component, props: airlineStarterProps(airline.id), preview: true });
  if (template === "special-assistance") return createElement("div", { className: "starter-guidance-preview" }, specialAssistance({}));
  if (template === "missed-flight") return createElement("div", { className: "starter-guidance-preview" }, missedFlight({}));
  if (template === "visa-check") return createElement("div", { className: "starter-guidance-preview" }, visaCheck({}));
  return createElement("div", { className: "blank-starter-preview" }, createElement("span", null, "+"), createElement("strong", null, "Blank canvas"));
}
