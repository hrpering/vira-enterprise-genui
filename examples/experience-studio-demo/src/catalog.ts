import { createStudioDesignCatalog } from "@vira-enterprise-genui/studio-design";
import type { StudioRuntimeReactRenderer } from "@vira-enterprise-genui/studio-runtime-react";
import type { StudioExperienceDocument, StudioNode } from "@vira-enterprise-genui/studio-schema";
import { createElement } from "react";
import type { ComponentType, ReactNode } from "react";

export const starterTemplates = Object.freeze([
  { id: "flight-search", label: "Flight search", description: "Brand-native flight discovery card." },
  { id: "special-assistance", label: "Special assistance", description: "Mobility and airport assistance guidance." },
  { id: "missed-flight", label: "Missed flight", description: "Scenario-based missed-flight policy experience." },
  { id: "visa-check", label: "Visa check", description: "Travel-document requirements experience." },
  { id: "blank", label: "Blank", description: "Start with an empty approved layout." },
] as const);

export type StarterTemplateId = (typeof starterTemplates)[number]["id"];

const baseCatalog = {
  version: "1",
  id: "airline.demo.components",
  brandId: "airline.demo",
  components: [
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
      ref: "airline.component.flight-search",
      label: "Flight search",
      category: "flight",
      kind: "input",
      props: [
        { key: "origin", type: "string", required: true, bindable: false },
        { key: "destination", type: "string", required: true, bindable: false },
        { key: "departure", type: "string", required: true, bindable: false },
        { key: "passengers", type: "number", required: true, bindable: false },
      ],
      slots: [],
      events: [{ name: "submit", label: "Submit" }],
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
        { key: "nextAction", type: "string", required: true, bindable: false },
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
        { key: "originCountry", type: "string", required: true, bindable: false },
        { key: "destinationCountry", type: "string", required: true, bindable: false },
        { key: "summary", type: "string", required: true, bindable: false },
      ],
      slots: [],
      events: [],
    },
  ],
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
  id: "airline.demo.data",
  sources: [],
};

export const actionAdapter = {
  version: "1",
  id: "airline.demo.actions",
  mappings: [{ event: "flight.search.submit", actionType: "travel.flight.search.submit" }],
};

export const runtimePermissionPolicy = {
  version: "1",
  rules: [
    { subject: "action", id: "travel.flight.search.submit", effect: "allow" },
    { subject: "action", id: "runtime.patch.apply", effect: "allow" },
  ],
} as const;

function textProp(props: Readonly<Record<string, unknown>>, key: string, fallback: string): string {
  const value = props[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function numberProp(props: Readonly<Record<string, unknown>>, key: string, fallback: number): number {
  const value = props[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function field(label: string, value: string, type = "text"): ReactNode {
  return createElement(
    "label",
    null,
    createElement("span", null, label),
    createElement("input", { type, value, readOnly: true, "aria-label": label }),
  );
}

function flightSearch(props: Readonly<Record<string, unknown>>): ReactNode {
  const origin = textProp(props, "origin", "SAW");
  const destination = textProp(props, "destination", "BER");
  const departure = textProp(props, "departure", "2026-09-15");
  const passengers = numberProp(props, "passengers", 2);
  return createElement(
    "form",
    { className: "vira-search-card", onSubmit: (event: { preventDefault(): void }) => event.preventDefault() },
    createElement(
      "div",
      { className: "vira-route-grid" },
      field("From", origin),
      createElement("div", { className: "vira-route-arrow", "aria-hidden": true }, "→"),
      field("To", destination),
    ),
    createElement(
      "div",
      { className: "vira-search-details" },
      field("Departure", departure, "date"),
      field("Passengers", String(passengers), "number"),
    ),
    createElement("button", { type: "button", className: "vira-primary-button" }, "Search flights"),
  );
}

function guidanceHeader(kicker: string, title: string, summary: string, chip: string): ReactNode {
  return createElement(
    "div",
    { className: "guidance-shell" },
    createElement(
      "div",
      { className: "guidance-top" },
      createElement("div", null, createElement("span", { className: "guidance-kicker" }, kicker), createElement("strong", null, title)),
      createElement("span", { className: "guidance-chip" }, chip),
    ),
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
    createElement(
      "div",
      { className: "guidance-choice-grid" },
      createElement("div", { className: "guidance-choice" }, createElement("b", null, "WCHR"), createElement("strong", null, "Ramp assistance"), createElement("span", null, "Passenger can use stairs and walk to the seat.")),
      createElement("div", { className: "guidance-choice" }, createElement("b", null, "WCHS"), createElement("strong", null, "Stair assistance"), createElement("span", null, "Passenger cannot use stairs but can walk to the seat.")),
      createElement("div", { className: "guidance-choice" }, createElement("b", null, "WCHC"), createElement("strong", null, "Cabin-seat assistance"), createElement("span", null, "Passenger needs assistance all the way to the seat.")),
    ),
  );
}

function missedFlight(props: Readonly<Record<string, unknown>>): ReactNode {
  const summary = textProp(props, "summary", "What happens depends on when and where the journey is interrupted.");
  const nextAction = textProp(props, "nextAction", "Check the fare rules attached to the current ticket before rebooking.");
  return createElement(
    "section",
    { className: "vira-guidance" },
    guidanceHeader("Travel policy", "If you miss your flight", summary, "Scenario guide"),
    createElement("div", { className: "guidance-tabs" }, createElement("span", { className: "active" }, "No-show"), createElement("span", null, "Connection"), createElement("span", null, "Airport delay")),
    createElement(
      "div",
      { className: "guidance-policy-panel" },
      createElement("strong", null, "If you do not board"),
      createElement("ul", null, createElement("li", null, "Your remaining itinerary may be affected by the fare rules."), createElement("li", null, "A new fare difference or service fee may apply."), createElement("li", null, "Do not assume the next segment remains valid without checking.")),
      createElement("div", { className: "guidance-next" }, createElement("span", null, "Best next step"), createElement("strong", null, nextAction)),
    ),
  );
}

function visaCheck(props: Readonly<Record<string, unknown>>): ReactNode {
  const origin = textProp(props, "originCountry", "Türkiye");
  const destination = textProp(props, "destinationCountry", "Germany");
  const summary = textProp(props, "summary", "Entry rules depend on the traveler's passport, nationality and residence status.");
  return createElement(
    "section",
    { className: "vira-guidance" },
    guidanceHeader("Entry requirements", `Check travel documents for ${destination}`, summary, "Official check required"),
    createElement("div", { className: "guidance-route" }, createElement("span", null, "Travel"), createElement("strong", null, `${origin} → ${destination}`)),
    createElement(
      "div",
      { className: "guidance-form-grid" },
      field("Nationality", "TUR"),
      field("Passport issued by", "TR"),
      field("Country of residence", "TUR"),
    ),
    createElement("button", { type: "button", className: "guidance-primary" }, "Check requirements"),
  );
}

function heading(props: Readonly<Record<string, unknown>>): ReactNode {
  return createElement("h1", { className: "demo-heading" }, textProp(props, "text", "Heading"));
}

function text(props: Readonly<Record<string, unknown>>): ReactNode {
  return createElement("p", { className: "demo-text" }, textProp(props, "text", "Text"));
}

type SlotComponent = ComponentType<{ minEmptyHeight?: number }>;

export const workbenchRenderers = {
  "airline.layout.stack": ({ props }: { props: Readonly<Record<string, unknown>> }) => {
    const Content = props.content as SlotComponent | undefined;
    return createElement("section", { className: "demo-stack" }, Content ? createElement(Content, { minEmptyHeight: 120 }) : null);
  },
  "airline.component.heading": ({ props }: { props: Readonly<Record<string, unknown>> }) => heading(props),
  "airline.component.text": ({ props }: { props: Readonly<Record<string, unknown>> }) => text(props),
  "airline.component.flight-search": ({ props }: { props: Readonly<Record<string, unknown>> }) => flightSearch(props),
  "airline.component.special-assistance": ({ props }: { props: Readonly<Record<string, unknown>> }) => specialAssistance(props),
  "airline.component.missed-flight": ({ props }: { props: Readonly<Record<string, unknown>> }) => missedFlight(props),
  "airline.component.visa-check": ({ props }: { props: Readonly<Record<string, unknown>> }) => visaCheck(props),
};

const runtimeStack: StudioRuntimeReactRenderer = ({ slots }) => createElement("section", { className: "demo-stack" }, ...(slots.content ?? []));
const runtimeHeading: StudioRuntimeReactRenderer = ({ props }) => heading(props);
const runtimeText: StudioRuntimeReactRenderer = ({ props }) => text(props);
const runtimeFlightSearch: StudioRuntimeReactRenderer = ({ props }) => flightSearch(props);
const runtimeSpecialAssistance: StudioRuntimeReactRenderer = ({ props }) => specialAssistance(props);
const runtimeMissedFlight: StudioRuntimeReactRenderer = ({ props }) => missedFlight(props);
const runtimeVisaCheck: StudioRuntimeReactRenderer = ({ props }) => visaCheck(props);

export const runtimeRenderers = {
  "airline.layout.stack": runtimeStack,
  "airline.component.heading": runtimeHeading,
  "airline.component.text": runtimeText,
  "airline.component.flight-search": runtimeFlightSearch,
  "airline.component.special-assistance": runtimeSpecialAssistance,
  "airline.component.missed-flight": runtimeMissedFlight,
  "airline.component.visa-check": runtimeVisaCheck,
};

const rootProps = {
  designbackgroundmode: "solid",
  designbackground: "#FFFFFF",
  designpadding: 24,
  designgap: 16,
  designradius: 20,
  designshadow: "sm",
  designlayout: "column",
};

function starterNodes(template: StarterTemplateId): StudioNode[] {
  const nodes: StudioNode[] = [{ id: "root", component: "airline.layout.stack", order: 0, props: rootProps }];
  if (template === "blank") return nodes;

  if (template === "flight-search") {
    nodes.push(
      { id: "title", component: "airline.component.heading", parentId: "root", slot: "content", order: 0, props: { text: "Find your next flight", designfontsize: 28, designweight: "700", designcolor: "#121A2F" } },
      { id: "flight-search", component: "airline.component.flight-search", parentId: "root", slot: "content", order: 1, props: { origin: "SAW", destination: "BER", departure: "2026-09-15", passengers: 2 } },
    );
    return nodes;
  }

  if (template === "special-assistance") {
    nodes.push({ id: "special-assistance", component: "airline.component.special-assistance", parentId: "root", slot: "content", order: 0, props: { summary: "Choose the assistance level that best matches the passenger's mobility needs.", deadline: "Request as early as possible before departure" } });
    return nodes;
  }

  if (template === "missed-flight") {
    nodes.push({ id: "missed-flight", component: "airline.component.missed-flight", parentId: "root", slot: "content", order: 0, props: { summary: "What happens depends on when and where the journey is interrupted.", nextAction: "Check the fare rules attached to the current ticket before rebooking." } });
    return nodes;
  }

  nodes.push({ id: "visa-check", component: "airline.component.visa-check", parentId: "root", slot: "content", order: 0, props: { originCountry: "Türkiye", destinationCountry: "Germany", summary: "Entry rules depend on the traveler's passport, nationality and residence status." } });
  return nodes;
}

export function createStarterDocument(experienceId: string, template: StarterTemplateId): StudioExperienceDocument {
  const recipeSuffix = experienceId.replaceAll(".", "-");
  return {
    version: "1",
    id: experienceId,
    recipeId: `studio.demo.${recipeSuffix}`,
    entryView: "main",
    views: [{ id: "main", nodes: starterNodes(template) }],
    bindings: [],
    interactions: [],
  };
}
