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
import { DEFAULT_MOCK_RUNTIME_INPUT, createMockAirlineRuntimeData } from "@vira-enterprise-genui/mock-airline-domain";
import { createStudioDesignCatalog } from "@vira-enterprise-genui/studio-design";
import type { StudioRuntimeReactRenderer } from "@vira-enterprise-genui/studio-runtime-react";
import type { StudioExperienceDocument, StudioNode } from "@vira-enterprise-genui/studio-schema";
import { createElement, useLayoutEffect, useRef } from "react";
import type { ComponentType, ReactElement, ReactNode } from "react";

const guidanceComponents = [
  { ref: AIRLINE_GUIDANCE_STUDIO_COMPONENTS.specialAssistance, label: "Special assistance", category: "guidance", kind: "input", props: [{ key: "summary", type: "string", required: true, bindable: true }, { key: "deadline", type: "string", required: true, bindable: true }], slots: [], events: [{ name: "select", label: "Assistance selected" }, { name: "continue", label: "Continue" }] },
  { ref: AIRLINE_GUIDANCE_STUDIO_COMPONENTS.missedFlight, label: "Missed flight", category: "guidance", kind: "input", props: [{ key: "summary", type: "string", required: true, bindable: true }, { key: "next-action", type: "string", required: true, bindable: true }], slots: [], events: [{ name: "select", label: "Scenario selected" }, { name: "continue", label: "Continue" }] },
  { ref: AIRLINE_GUIDANCE_STUDIO_COMPONENTS.visaCheck, label: "Visa check", category: "guidance", kind: "input", props: [{ key: "origin-country", type: "string", required: true, bindable: true }, { key: "destination-country", type: "string", required: true, bindable: true }, { key: "summary", type: "string", required: true, bindable: true }], slots: [], events: [{ name: "submit", label: "Profile submitted" }, { name: "continue", label: "Continue" }] },
] as const;

const genericComponents = [
  { ref: "airline.layout.stack", label: "Stack", category: "layout", kind: "layout", props: [], slots: [{ name: "content", label: "Content" }], events: [] },
  { ref: "airline.layout.row", label: "Row", category: "layout", kind: "layout", props: [], slots: [{ name: "content", label: "Content" }], events: [] },
  { ref: "airline.layout.grid", label: "Grid", category: "layout", kind: "layout", props: [{ key: "columns", type: "enum", required: true, bindable: false, options: ["2", "3"] }], slots: [{ name: "content", label: "Content" }], events: [] },
  { ref: "airline.layout.card", label: "Card", category: "layout", kind: "layout", props: [{ key: "variant", type: "enum", required: true, bindable: false, options: ["default", "accent", "subtle"] }], slots: [{ name: "content", label: "Content" }], events: [] },
  { ref: "airline.component.heading", label: "Heading", category: "content", kind: "content", props: [{ key: "text", type: "string", required: true, bindable: true }], slots: [], events: [] },
  { ref: "airline.component.text", label: "Text", category: "content", kind: "content", props: [{ key: "text", type: "string", required: true, bindable: true }], slots: [], events: [] },
  { ref: "airline.component.button", label: "Button", category: "action", kind: "action", props: [{ key: "label", type: "string", required: true, bindable: true }, { key: "variant", type: "enum", required: true, bindable: false, options: ["primary", "secondary", "ghost"] }], slots: [], events: [{ name: "press", label: "Pressed" }] },
  { ref: "airline.component.badge", label: "Badge", category: "content", kind: "content", props: [{ key: "text", type: "string", required: true, bindable: true }, { key: "tone", type: "enum", required: true, bindable: false, options: ["neutral", "accent", "success", "warning"] }], slots: [], events: [] },
  { ref: "airline.component.price", label: "Price", category: "content", kind: "content", props: [{ key: "amount", type: "number", required: true, bindable: true }, { key: "currency", type: "string", required: true, bindable: true }], slots: [], events: [] },
  { ref: "airline.component.divider", label: "Divider", category: "content", kind: "content", props: [], slots: [], events: [] },
] as const;

const baseCatalog = { version: "1", id: "airline.studio.components", brandId: "airline.brand", components: [...genericComponents, ...AIRLINE_STUDIO_CATALOG_INPUT.components, ...guidanceComponents] };
const styledCatalog = createStudioDesignCatalog(baseCatalog, { colorMode: "any", fonts: ["Inter", "Arial", "Georgia"], allowGradient: true, shadows: ["none", "sm", "md", "lg", "xl"], layouts: ["block", "row", "column", "grid2", "grid3"] });
if (!styledCatalog.ok) throw new Error(styledCatalog.issue.message);
export const componentCatalog = styledCatalog.value;

export const bindingSourceCatalog = { version: "1", id: "airline.studio.data", sources: [] };
export const actionAdapter = { version: "1", id: "airline.studio.actions", mappings: [
  { event: "flight.search.submit", actionType: "travel.flight.search.submit" }, { event: "flight.offer.select", actionType: "travel.flight.offer.select" }, { event: "flight.fare.select", actionType: "travel.flight.fare.select" }, { event: "flight.passenger.submit", actionType: "travel.flight.passenger.submit" }, { event: "flight.seat.select", actionType: "travel.flight.seat.select" }, { event: "flight.baggage.select", actionType: "travel.flight.baggage.select" }, { event: "flight.extras.submit", actionType: "travel.flight.extras.submit" }, { event: "flight.booking.handoff", actionType: "travel.flight.booking.handoff" }, { event: "guidance.assistance.select", actionType: "travel.guidance.assistance.select" }, { event: "guidance.policy.select", actionType: "travel.guidance.policy.select" }, { event: "guidance.visa.submit", actionType: "travel.guidance.visa.submit" }, { event: "guidance.handoff", actionType: "travel.guidance.handoff" },
] };
const allowedActions = ["travel.flight.search.submit", "travel.flight.offer.select", "travel.flight.fare.select", "travel.flight.passenger.submit", "travel.flight.seat.select", "travel.flight.baggage.select", "travel.flight.extras.submit", "travel.flight.booking.handoff", "travel.guidance.assistance.select", "travel.guidance.policy.select", "travel.guidance.visa.submit", "travel.guidance.handoff", "runtime.patch.apply"] as const;
export const runtimePermissionPolicy = { version: "1", rules: allowedActions.map((id) => ({ subject: "action" as const, id, effect: "allow" as const })) } as const;

function textProp(props: Readonly<Record<string, unknown>>, key: string, fallback: string): string { const value = props[key]; return typeof value === "string" && value.length > 0 ? value : fallback; }
function numberProp(props: Readonly<Record<string, unknown>>, key: string, fallback: number): number { const value = props[key]; return typeof value === "number" && Number.isFinite(value) ? value : fallback; }
interface SharedDomHostProps { readonly family: "booking" | "guidance"; readonly component: string; readonly props: Readonly<Record<string, unknown>>; readonly emit?: (event: string, payload?: unknown) => void; readonly preview?: boolean; }
function SharedDomHost({ family, component, props, emit, preview = false }: SharedDomHostProps): ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => { if (!ref.current) return undefined; const host = ref.current; return family === "booking" ? mountAirlineStudioComponent(host, component, props, emit) : mountAirlineGuidanceStudioComponent(host, component, props, emit); }, [family, component, props, emit]);
  return createElement("div", { ref, className: preview ? "shared-brand-preview" : "shared-brand-runtime" });
}
function heading(props: Readonly<Record<string, unknown>>): ReactNode { return createElement("h2", { className: "demo-heading", style: { margin: 0 } }, textProp(props, "text", "Heading")); }
function bodyText(props: Readonly<Record<string, unknown>>): ReactNode { return createElement("p", { className: "demo-text", style: { margin: 0 } }, textProp(props, "text", "Text")); }
function badge(props: Readonly<Record<string, unknown>>): ReactNode { return createElement("span", { style: { display: "inline-flex", width: "fit-content", padding: "5px 9px", borderRadius: 999, background: "#fff3d6", border: "1px solid #f4cc72", fontSize: 12, fontWeight: 750 } }, textProp(props, "text", "Badge")); }
function price(props: Readonly<Record<string, unknown>>): ReactNode { return createElement("strong", { style: { fontSize: 24, letterSpacing: "-.03em" } }, `${textProp(props, "currency", "EUR")} ${numberProp(props, "amount", 0).toFixed(0)}`); }
function divider(): ReactNode { return createElement("hr", { style: { width: "100%", border: 0, borderTop: "1px solid rgba(18,26,47,.14)", margin: "4px 0" } }); }
type SlotComponent = ComponentType<{ minEmptyHeight?: number }>;
function slotFromProps(props: Readonly<Record<string, unknown>>): ReactNode { const Content = props.content as SlotComponent | undefined; return Content ? createElement(Content, { minEmptyHeight: 64 }) : null; }
function stack(props: Readonly<Record<string, unknown>>): ReactNode { return createElement("section", { className: "demo-stack", style: { display: "grid", gap: 14 } }, slotFromProps(props)); }
function row(props: Readonly<Record<string, unknown>>): ReactNode { return createElement("section", { style: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" } }, slotFromProps(props)); }
function grid(props: Readonly<Record<string, unknown>>): ReactNode { const columns = textProp(props, "columns", "2"); return createElement("section", { style: { display: "grid", gridTemplateColumns: `repeat(${columns === "3" ? 3 : 2}, minmax(0, 1fr))`, gap: 12 } }, slotFromProps(props)); }
function card(props: Readonly<Record<string, unknown>>): ReactNode { const variant = textProp(props, "variant", "default"); return createElement("section", { style: { display: "grid", gap: 10, padding: 18, borderRadius: 18, border: "1px solid rgba(18,26,47,.12)", background: variant === "accent" ? "#fff7e8" : variant === "subtle" ? "#f7f8fa" : "#fff", boxShadow: "0 8px 24px rgba(18,26,47,.06)" } }, slotFromProps(props)); }
function visualButton(props: Readonly<Record<string, unknown>>, onPress?: () => void): ReactNode { const variant = textProp(props, "variant", "primary"); return createElement("button", { type: "button", onClick: onPress, style: { width: "fit-content", minHeight: 38, borderRadius: 10, padding: "8px 14px", border: variant === "primary" ? 0 : "1px solid #d1d5db", background: variant === "primary" ? "#111827" : variant === "ghost" ? "transparent" : "#fff", color: variant === "primary" ? "#fff" : "#111827", fontWeight: 750 } }, textProp(props, "label", "Button")); }

const bookingWorkbenchRenderers = Object.fromEntries(Object.values(AIRLINE_STUDIO_COMPONENTS).map((component) => [component, ({ props }: { props: Readonly<Record<string, unknown>> }) => createElement(SharedDomHost, { family: "booking", component, props })]));
const guidanceWorkbenchRenderers = Object.fromEntries(Object.values(AIRLINE_GUIDANCE_STUDIO_COMPONENTS).map((component) => [component, ({ props }: { props: Readonly<Record<string, unknown>> }) => createElement(SharedDomHost, { family: "guidance", component, props })]));
export const workbenchRenderers = {
  "airline.layout.stack": ({ props }: { props: Readonly<Record<string, unknown>> }) => stack(props),
  "airline.layout.row": ({ props }: { props: Readonly<Record<string, unknown>> }) => row(props),
  "airline.layout.grid": ({ props }: { props: Readonly<Record<string, unknown>> }) => grid(props),
  "airline.layout.card": ({ props }: { props: Readonly<Record<string, unknown>> }) => card(props),
  "airline.component.heading": ({ props }: { props: Readonly<Record<string, unknown>> }) => heading(props),
  "airline.component.text": ({ props }: { props: Readonly<Record<string, unknown>> }) => bodyText(props),
  "airline.component.button": ({ props }: { props: Readonly<Record<string, unknown>> }) => visualButton(props),
  "airline.component.badge": ({ props }: { props: Readonly<Record<string, unknown>> }) => badge(props),
  "airline.component.price": ({ props }: { props: Readonly<Record<string, unknown>> }) => price(props),
  "airline.component.divider": () => divider(),
  ...bookingWorkbenchRenderers, ...guidanceWorkbenchRenderers,
};
const slotRuntime = (style: Readonly<Record<string, unknown>> = {}): StudioRuntimeReactRenderer => ({ slots }) => createElement("section", { style }, ...(slots.content ?? []));
const runtimeRenderersGeneric: Readonly<Record<string, StudioRuntimeReactRenderer>> = {
  "airline.layout.stack": slotRuntime({ display: "grid", gap: 14 }),
  "airline.layout.row": slotRuntime({ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }),
  "airline.layout.grid": ({ props, slots }) => createElement("section", { style: { display: "grid", gridTemplateColumns: `repeat(${textProp(props, "columns", "2") === "3" ? 3 : 2}, minmax(0, 1fr))`, gap: 12 } }, ...(slots.content ?? [])),
  "airline.layout.card": ({ props, slots }) => { const variant = textProp(props, "variant", "default"); return createElement("section", { style: { display: "grid", gap: 10, padding: 18, borderRadius: 18, border: "1px solid rgba(18,26,47,.12)", background: variant === "accent" ? "#fff7e8" : variant === "subtle" ? "#f7f8fa" : "#fff", boxShadow: "0 8px 24px rgba(18,26,47,.06)" } }, ...(slots.content ?? [])); },
  "airline.component.heading": ({ props }) => heading(props),
  "airline.component.text": ({ props }) => bodyText(props),
  "airline.component.button": ({ props, emit }) => visualButton(props, () => { emit("press", {}); }),
  "airline.component.badge": ({ props }) => badge(props),
  "airline.component.price": ({ props }) => price(props),
  "airline.component.divider": () => divider(),
};
const bookingRuntimeRenderers = Object.fromEntries(Object.values(AIRLINE_STUDIO_COMPONENTS).map((component) => [component, (({ props, emit }) => createElement(SharedDomHost, { family: "booking", component, props, emit: (event, payload) => { emit(event, payload); } })) satisfies StudioRuntimeReactRenderer]));
const guidanceRuntimeRenderers = Object.fromEntries(Object.values(AIRLINE_GUIDANCE_STUDIO_COMPONENTS).map((component) => [component, (({ props, emit }) => createElement(SharedDomHost, { family: "guidance", component, props, emit: (event, payload) => { emit(event, payload); } })) satisfies StudioRuntimeReactRenderer]));
export const runtimeRenderers = { ...runtimeRenderersGeneric, ...bookingRuntimeRenderers, ...guidanceRuntimeRenderers };

const guidanceTemplates = [
  { id: "special-assistance", label: "Special assistance", description: "Mobility and airport assistance guidance.", component: AIRLINE_GUIDANCE_STUDIO_COMPONENTS.specialAssistance },
  { id: "missed-flight", label: "Missed flight", description: "Scenario-based missed-flight policy experience.", component: AIRLINE_GUIDANCE_STUDIO_COMPONENTS.missedFlight },
  { id: "visa-check", label: "Visa check", description: "Travel-document requirements experience.", component: AIRLINE_GUIDANCE_STUDIO_COMPONENTS.visaCheck },
] as const;
const blankTemplate = { id: "blank", label: "Blank", description: "Start with an empty approved layout." } as const;
const composableTemplate = { id: "composable-canvas", label: "Composable canvas", description: "A nested card built from individually editable brand primitives." } as const;
export const starterTemplates = Object.freeze([...AIRLINE_STARTER_TEMPLATES, ...guidanceTemplates, composableTemplate, blankTemplate]);
export type StarterTemplateId = (typeof starterTemplates)[number]["id"];
type GuidanceTemplateId = (typeof guidanceTemplates)[number]["id"];
const guidanceRuntimeData = createMockAirlineRuntimeData(DEFAULT_MOCK_RUNTIME_INPUT);
function guidanceString(path: string): string { const value = guidanceRuntimeData[path]; if (typeof value !== "string") throw new Error(`Mock airline guidance default ${path} must be a string`); return value; }
function guidanceProps(template: GuidanceTemplateId): Readonly<Record<string, string>> {
  if (template === "special-assistance") return { summary: guidanceString("guidance.special-assistance.summary"), deadline: guidanceString("guidance.special-assistance.deadline") };
  if (template === "missed-flight") return { summary: guidanceString("guidance.missed-flight.summary"), "next-action": guidanceString("guidance.missed-flight.next-action") };
  return { "origin-country": guidanceString("guidance.visa.origin-country"), "destination-country": guidanceString("guidance.visa.destination-country"), summary: guidanceString("guidance.visa.summary") };
}
function guidanceDocument(experienceId: string, template: GuidanceTemplateId): StudioExperienceDocument {
  const definition = guidanceTemplates.find((candidate) => candidate.id === template); if (!definition) throw new Error(`Unknown guidance template: ${template}`);
  const node: StudioNode = { id: "root", component: definition.component, order: 0, props: { ...guidanceProps(template) } };
  return { version: "1", id: experienceId, recipeId: `studio.guidance.${experienceId.replaceAll(".", "-")}`, entryView: "main", views: [{ id: "main", nodes: [node] }], bindings: [], interactions: [] };
}
function blankDocument(experienceId: string): StudioExperienceDocument { return { version: "1", id: experienceId, recipeId: `studio.blank.${experienceId.replaceAll(".", "-")}`, entryView: "main", views: [{ id: "main", nodes: [{ id: "root", component: "airline.layout.stack", order: 0, props: {} }] }], bindings: [], interactions: [] }; }
function composableDocument(experienceId: string): StudioExperienceDocument {
  const nodes: StudioNode[] = [
    { id: "root", component: "airline.layout.stack", order: 0, props: { designgap: 16 } },
    { id: "title", component: "airline.component.heading", parentId: "root", slot: "content", order: 0, props: { text: "Your next experience", designfontsize: 30, designweight: "700" } },
    { id: "intro", component: "airline.component.text", parentId: "root", slot: "content", order: 1, props: { text: "Every element in this starter is an editable Studio node." } },
    { id: "card", component: "airline.layout.card", parentId: "root", slot: "content", order: 2, props: { variant: "accent", designradius: 22, designpadding: 20, designgap: 12 } },
    { id: "badge", component: "airline.component.badge", parentId: "card", slot: "content", order: 0, props: { text: "Flexible", tone: "accent" } },
    { id: "card-title", component: "airline.component.heading", parentId: "card", slot: "content", order: 1, props: { text: "Build with brand components", designfontsize: 22, designweight: "700" } },
    { id: "card-copy", component: "airline.component.text", parentId: "card", slot: "content", order: 2, props: { text: "Change copy, styling and layout, then drag in more approved components." } },
    { id: "price", component: "airline.component.price", parentId: "card", slot: "content", order: 3, props: { amount: 138, currency: "EUR", designfontsize: 28, designweight: "800" } },
    { id: "button", component: "airline.component.button", parentId: "card", slot: "content", order: 4, props: { label: "Continue", variant: "primary", designradius: 12 } },
    { id: "divider", component: "airline.component.divider", parentId: "root", slot: "content", order: 3, props: {} },
  ];
  return { version: "1", id: experienceId, recipeId: `studio.composable.${experienceId.replaceAll(".", "-")}`, entryView: "main", views: [{ id: "main", nodes }], bindings: [], interactions: [] };
}
export function createStarterDocument(experienceId: string, template: StarterTemplateId): StudioExperienceDocument {
  const booking = AIRLINE_STARTER_TEMPLATES.find((candidate) => candidate.id === template); if (booking) return createAirlineStarterDocument(experienceId, booking.id);
  const guidance = guidanceTemplates.find((candidate) => candidate.id === template); if (guidance) return guidanceDocument(experienceId, guidance.id);
  if (template === "composable-canvas") return composableDocument(experienceId);
  return blankDocument(experienceId);
}
export function starterPreview(template: StarterTemplateId): ReactElement {
  const booking = AIRLINE_STARTER_TEMPLATES.find((candidate) => candidate.id === template); if (booking) return createElement(SharedDomHost, { family: "booking", component: booking.component, props: airlineStarterProps(booking.id), preview: true });
  const guidance = guidanceTemplates.find((candidate) => candidate.id === template); if (guidance) return createElement(SharedDomHost, { family: "guidance", component: guidance.component, props: guidanceProps(guidance.id), preview: true });
  if (template === "composable-canvas") return createElement("div", { style: { display: "grid", gap: 8, padding: 12, borderRadius: 16, border: "1px solid rgba(18,26,47,.12)", background: "#fff7e8" } }, createElement("strong", null, "Composable canvas"), createElement("span", null, "Heading · Text · Card · Badge · Price · Button"));
  return createElement("div", { className: "blank-starter-preview" }, createElement("span", null, "+"), createElement("strong", null, "Blank canvas"));
}
