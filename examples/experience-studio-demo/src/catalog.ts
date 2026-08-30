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
import { createStudioDesignCatalog } from "@vira-enterprise-genui/studio-design";
import type { StudioRuntimeReactRenderer } from "@vira-enterprise-genui/studio-runtime-react";
import type { StudioExperienceDocument, StudioNode } from "@vira-enterprise-genui/studio-schema";
import { createElement, useLayoutEffect, useRef } from "react";
import type { ComponentType, ReactElement, ReactNode } from "react";

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
] as const;

const baseCatalog = {
  version: "1",
  id: "airline.studio.components",
  brandId: "airline.brand",
  components: [...genericComponents, ...AIRLINE_STUDIO_CATALOG_INPUT.components, ...guidanceComponents],
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

function textProp(props: Readonly<Record<string, unknown>>, key: string, fallback: string): string {
  const value = props[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

interface SharedDomHostProps {
  readonly family: "booking" | "guidance";
  readonly component: string;
  readonly props: Readonly<Record<string, unknown>>;
  readonly emit?: (event: string, payload?: unknown) => void;
  readonly preview?: boolean;
}

interface LocalSeatState {
  readonly key: string;
  readonly baseAssigned: number;
  readonly selected: Set<string>;
}

function passengerCountFromProps(props: Readonly<Record<string, unknown>>): number {
  const value = props.passengers;
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(8, Math.max(1, Math.round(value)))
    : 2;
}

function seatStateKey(component: string, props: Readonly<Record<string, unknown>>): string {
  const fare = typeof props.fare === "string" ? props.fare : "";
  return `${component}:${passengerCountFromProps(props)}:${fare}`;
}

function seatId(button: HTMLButtonElement): string | undefined {
  const value = button.querySelector("strong")?.textContent?.trim();
  return value && value.length > 0 ? value : undefined;
}

function applyLocalSeatState(host: HTMLElement, passengers: number, state: LocalSeatState): void {
  for (const button of host.querySelectorAll<HTMLButtonElement>("button.vira-seat")) {
    const id = seatId(button);
    if (id && state.selected.has(id)) {
      button.classList.add("selected");
      button.disabled = true;
    }
  }

  const assigned = Math.min(passengers, state.baseAssigned + state.selected.size);
  const banner = host.querySelector<HTMLElement>(".vira-active-traveller");
  const avatar = banner?.querySelector<HTMLElement>(":scope > span");
  const title = banner?.querySelector<HTMLElement>("div > strong");
  const progress = banner?.querySelector<HTMLElement>("div > span");
  if (progress) progress.textContent = `${assigned}/${passengers} assigned`;
  if (title) {
    title.textContent = assigned >= passengers
      ? "All travellers have seats"
      : `Choose a seat for traveller ${assigned + 1}`;
  }
  if (avatar) avatar.textContent = `P${Math.min(passengers, assigned + 1)}`;

  if (assigned >= passengers) {
    for (const candidate of host.querySelectorAll<HTMLButtonElement>("button.vira-seat")) {
      if (!candidate.classList.contains("occupied")) candidate.disabled = true;
    }
  }
}

function installLocalSeatAssignmentState(
  host: HTMLElement,
  component: string,
  props: Readonly<Record<string, unknown>>,
  holder: { current: LocalSeatState | undefined },
): () => void {
  if (component !== AIRLINE_STUDIO_COMPONENTS.seatMap) return () => undefined;
  const passengers = passengerCountFromProps(props);
  const key = seatStateKey(component, props);
  if (!holder.current || holder.current.key !== key) {
    const initialProgress = host.querySelector<HTMLElement>(".vira-active-traveller div > span")?.textContent ?? "";
    const parsedAssigned = Number.parseInt(initialProgress.split("/")[0] ?? "", 10);
    holder.current = {
      key,
      baseAssigned: Number.isSafeInteger(parsedAssigned)
        ? Math.min(passengers, Math.max(0, parsedAssigned))
        : passengers > 1 ? 1 : 0,
      selected: new Set<string>(),
    };
  }
  const localState = holder.current;
  applyLocalSeatState(host, passengers, localState);

  const onClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest("button.vira-seat");
    if (!(button instanceof HTMLButtonElement) || !host.contains(button)) return;
    if (button.disabled || button.classList.contains("occupied") || button.classList.contains("selected")) return;
    const id = seatId(button);
    if (!id) return;
    localState.selected.add(id);
    queueMicrotask(() => applyLocalSeatState(host, passengers, localState));
  };

  host.addEventListener("click", onClick, true);
  return () => host.removeEventListener("click", onClick, true);
}

function SharedDomHost({ family, component, props, emit, preview = false }: SharedDomHostProps): ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  const localSeatState = useRef<LocalSeatState | undefined>(undefined);
  useLayoutEffect(() => {
    if (!ref.current) return undefined;
    const host = ref.current;
    const disposeRenderer = family === "booking"
      ? mountAirlineStudioComponent(host, component, props, emit)
      : mountAirlineGuidanceStudioComponent(host, component, props, emit);
    const disposeLocalState = family === "booking"
      ? installLocalSeatAssignmentState(host, component, props, localSeatState)
      : () => undefined;
    return () => {
      disposeLocalState();
      disposeRenderer();
    };
  }, [family, component, props, emit]);
  return createElement("div", {
    ref,
    className: preview ? "shared-brand-preview" : "shared-brand-runtime",
  });
}

function heading(props: Readonly<Record<string, unknown>>): ReactNode {
  return createElement("h1", { className: "demo-heading" }, textProp(props, "text", "Heading"));
}

function bodyText(props: Readonly<Record<string, unknown>>): ReactNode {
  return createElement("p", { className: "demo-text" }, textProp(props, "text", "Text"));
}

type SlotComponent = ComponentType<{ minEmptyHeight?: number }>;

const bookingWorkbenchRenderers = Object.fromEntries(Object.values(AIRLINE_STUDIO_COMPONENTS).map((component) => [
  component,
  ({ props }: { props: Readonly<Record<string, unknown>> }) => createElement(SharedDomHost, { family: "booking", component, props }),
]));

const guidanceWorkbenchRenderers = Object.fromEntries(Object.values(AIRLINE_GUIDANCE_STUDIO_COMPONENTS).map((component) => [
  component,
  ({ props }: { props: Readonly<Record<string, unknown>> }) => createElement(SharedDomHost, { family: "guidance", component, props }),
]));

export const workbenchRenderers = {
  "airline.layout.stack": ({ props }: { props: Readonly<Record<string, unknown>> }) => {
    const Content = props.content as SlotComponent | undefined;
    return createElement("section", { className: "demo-stack" }, Content ? createElement(Content, { minEmptyHeight: 120 }) : null);
  },
  "airline.component.heading": ({ props }: { props: Readonly<Record<string, unknown>> }) => heading(props),
  "airline.component.text": ({ props }: { props: Readonly<Record<string, unknown>> }) => bodyText(props),
  ...bookingWorkbenchRenderers,
  ...guidanceWorkbenchRenderers,
};

const runtimeStack: StudioRuntimeReactRenderer = ({ slots }) => createElement("section", { className: "demo-stack" }, ...(slots.content ?? []));
const runtimeHeading: StudioRuntimeReactRenderer = ({ props }) => heading(props);
const runtimeText: StudioRuntimeReactRenderer = ({ props }) => bodyText(props);

const bookingRuntimeRenderers = Object.fromEntries(Object.values(AIRLINE_STUDIO_COMPONENTS).map((component) => [
  component,
  (({ props, emit }) => createElement(SharedDomHost, { family: "booking", component, props, emit: (event, payload) => { emit(event, payload); } })) satisfies StudioRuntimeReactRenderer,
]));

const guidanceRuntimeRenderers = Object.fromEntries(Object.values(AIRLINE_GUIDANCE_STUDIO_COMPONENTS).map((component) => [
  component,
  (({ props, emit }) => createElement(SharedDomHost, { family: "guidance", component, props, emit: (event, payload) => { emit(event, payload); } })) satisfies StudioRuntimeReactRenderer,
]));

export const runtimeRenderers = {
  "airline.layout.stack": runtimeStack,
  "airline.component.heading": runtimeHeading,
  "airline.component.text": runtimeText,
  ...bookingRuntimeRenderers,
  ...guidanceRuntimeRenderers,
};

const guidanceTemplates = [
  { id: "special-assistance", label: "Special assistance", description: "Mobility and airport assistance guidance.", component: AIRLINE_GUIDANCE_STUDIO_COMPONENTS.specialAssistance },
  { id: "missed-flight", label: "Missed flight", description: "Scenario-based missed-flight policy experience.", component: AIRLINE_GUIDANCE_STUDIO_COMPONENTS.missedFlight },
  { id: "visa-check", label: "Visa check", description: "Travel-document requirements experience.", component: AIRLINE_GUIDANCE_STUDIO_COMPONENTS.visaCheck },
] as const;

const blankTemplate = { id: "blank", label: "Blank", description: "Start with an empty approved layout." } as const;

export const starterTemplates = Object.freeze([...AIRLINE_STARTER_TEMPLATES, ...guidanceTemplates, blankTemplate]);
export type StarterTemplateId = (typeof starterTemplates)[number]["id"];

type GuidanceTemplateId = (typeof guidanceTemplates)[number]["id"];
const guidanceRuntimeData = createMockAirlineRuntimeData(DEFAULT_MOCK_RUNTIME_INPUT);

function guidanceString(path: string): string {
  const value = guidanceRuntimeData[path];
  if (typeof value !== "string") throw new Error(`Mock airline guidance default ${path} must be a string`);
  return value;
}

function guidanceProps(template: GuidanceTemplateId): Readonly<Record<string, string>> {
  if (template === "special-assistance") {
    return {
      summary: guidanceString("guidance.special-assistance.summary"),
      deadline: guidanceString("guidance.special-assistance.deadline"),
    };
  }
  if (template === "missed-flight") {
    return {
      summary: guidanceString("guidance.missed-flight.summary"),
      "next-action": guidanceString("guidance.missed-flight.next-action"),
    };
  }
  return {
    "origin-country": guidanceString("guidance.visa.origin-country"),
    "destination-country": guidanceString("guidance.visa.destination-country"),
    summary: guidanceString("guidance.visa.summary"),
  };
}

function guidanceDocument(experienceId: string, template: GuidanceTemplateId): StudioExperienceDocument {
  const definition = guidanceTemplates.find((candidate) => candidate.id === template);
  if (!definition) throw new Error(`Unknown guidance template: ${template}`);
  const node: StudioNode = {
    id: "root",
    component: definition.component,
    order: 0,
    props: { ...guidanceProps(template) },
  };
  return {
    version: "1",
    id: experienceId,
    recipeId: `studio.guidance.${experienceId.replaceAll(".", "-")}`,
    entryView: "main",
    views: [{ id: "main", nodes: [node] }],
    bindings: [],
    interactions: [],
  };
}

function blankDocument(experienceId: string): StudioExperienceDocument {
  return {
    version: "1",
    id: experienceId,
    recipeId: `studio.blank.${experienceId.replaceAll(".", "-")}`,
    entryView: "main",
    views: [{ id: "main", nodes: [{ id: "root", component: "airline.layout.stack", order: 0, props: {} }] }],
    bindings: [],
    interactions: [],
  };
}

export function createStarterDocument(experienceId: string, template: StarterTemplateId): StudioExperienceDocument {
  const booking = AIRLINE_STARTER_TEMPLATES.find((candidate) => candidate.id === template);
  if (booking) return createAirlineStarterDocument(experienceId, booking.id);
  const guidance = guidanceTemplates.find((candidate) => candidate.id === template);
  if (guidance) return guidanceDocument(experienceId, guidance.id);
  return blankDocument(experienceId);
}

export function starterPreview(template: StarterTemplateId): ReactElement {
  const booking = AIRLINE_STARTER_TEMPLATES.find((candidate) => candidate.id === template);
  if (booking) {
    return createElement(SharedDomHost, {
      family: "booking",
      component: booking.component,
      props: airlineStarterProps(booking.id),
      preview: true,
    });
  }
  const guidance = guidanceTemplates.find((candidate) => candidate.id === template);
  if (guidance) {
    return createElement(SharedDomHost, {
      family: "guidance",
      component: guidance.component,
      props: guidanceProps(guidance.id),
      preview: true,
    });
  }
  return createElement("div", { className: "blank-starter-preview" }, createElement("span", null, "+"), createElement("strong", null, "Blank canvas"));
}
