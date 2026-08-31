import { createStudioComponentCatalog } from "@vira-enterprise-genui/studio-catalog";
import type { StudioRuntimeReactRenderer } from "@vira-enterprise-genui/studio-runtime-react";
import type { StudioExperienceDocument, StudioNode } from "@vira-enterprise-genui/studio-schema";
import { createElement } from "react";
import type { ChangeEvent, ReactElement, ReactNode } from "react";
import {
  actionAdapter,
  bindingSourceCatalog,
  componentCatalog as baseComponentCatalog,
  createStarterDocument as createBaseStarterDocument,
  runtimePermissionPolicy,
  runtimeRenderers as baseRuntimeRenderers,
  starterPreview as baseStarterPreview,
  starterTemplates as baseStarterTemplates,
  workbenchRenderers as baseWorkbenchRenderers,
} from "./catalog-v3.js";
import type { StarterTemplateId as BaseStarterTemplateId } from "./catalog-v3.js";

const FORM = "airline.layout.form" as const;
const TEXT_INPUT = "airline.input.text" as const;
const TEXTAREA = "airline.input.textarea" as const;
const CHECKBOX = "airline.input.checkbox" as const;
const ALERT = "airline.component.alert" as const;
const PROGRESS = "airline.component.progress" as const;

const formComponents = [
  {
    ref: FORM,
    label: "Form",
    category: "layout",
    kind: "layout",
    props: [],
    slots: [{ name: "content", label: "Content" }],
    events: [],
  },
  {
    ref: TEXT_INPUT,
    label: "Text input",
    category: "input",
    kind: "input",
    props: [
      { key: "label", type: "string", required: true, bindable: true },
      { key: "value", type: "string", required: true, bindable: true },
      { key: "placeholder", type: "string", required: true, bindable: false },
    ],
    slots: [],
    events: [{
      name: "change",
      label: "Value changed",
      payload: [{ key: "value", type: "string", required: true }],
    }],
  },
  {
    ref: TEXTAREA,
    label: "Textarea",
    category: "input",
    kind: "input",
    props: [
      { key: "label", type: "string", required: true, bindable: true },
      { key: "value", type: "string", required: true, bindable: true },
      { key: "placeholder", type: "string", required: true, bindable: false },
    ],
    slots: [],
    events: [{
      name: "change",
      label: "Value changed",
      payload: [{ key: "value", type: "string", required: true }],
    }],
  },
  {
    ref: CHECKBOX,
    label: "Checkbox",
    category: "input",
    kind: "input",
    props: [
      { key: "label", type: "string", required: true, bindable: true },
      { key: "checked", type: "boolean", required: true, bindable: true },
    ],
    slots: [],
    events: [{
      name: "change",
      label: "Checked changed",
      payload: [{ key: "checked", type: "boolean", required: true }],
    }],
  },
  {
    ref: ALERT,
    label: "Alert",
    category: "feedback",
    kind: "content",
    props: [
      { key: "text", type: "string", required: true, bindable: true },
      { key: "tone", type: "enum", required: true, bindable: false, options: ["info", "success", "warning", "error"] },
    ],
    slots: [],
    events: [],
  },
  {
    ref: PROGRESS,
    label: "Progress",
    category: "feedback",
    kind: "content",
    props: [
      { key: "label", type: "string", required: true, bindable: true },
      { key: "value", type: "number", required: true, bindable: true },
    ],
    slots: [],
    events: [],
  },
] as const;

const parsedCatalog = createStudioComponentCatalog({
  version: baseComponentCatalog.version,
  id: baseComponentCatalog.id,
  brandId: baseComponentCatalog.brandId,
  components: [...baseComponentCatalog.components, ...formComponents],
});
if (!parsedCatalog.ok) throw new Error(parsedCatalog.issue.message);
export const componentCatalog = parsedCatalog.value;
export { actionAdapter, bindingSourceCatalog, runtimePermissionPolicy };

function stringProp(props: Readonly<Record<string, unknown>>, key: string, fallback: string): string {
  const value = props[key];
  return typeof value === "string" ? value : fallback;
}

function boolProp(props: Readonly<Record<string, unknown>>, key: string): boolean {
  return props[key] === true;
}

function numberProp(props: Readonly<Record<string, unknown>>, key: string): number {
  const value = props[key];
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

function fieldShell(label: string, control: ReactNode): ReactNode {
  return createElement("label", { style: { display: "grid", gap: 6, fontWeight: 650 } },
    createElement("span", { style: { fontSize: 13 } }, label),
    control,
  );
}

function textInput(props: Readonly<Record<string, unknown>>, emit?: (event: string, payload?: unknown) => void): ReactNode {
  return fieldShell(stringProp(props, "label", "Label"), createElement("input", {
    value: stringProp(props, "value", ""),
    placeholder: stringProp(props, "placeholder", ""),
    readOnly: emit === undefined,
    onChange: emit === undefined ? undefined : (event: ChangeEvent<HTMLInputElement>) => { emit("change", { value: event.currentTarget.value }); },
    style: { minHeight: 42, border: "1px solid #d1d5db", borderRadius: 10, padding: "8px 10px", font: "inherit" },
  }));
}

function textarea(props: Readonly<Record<string, unknown>>, emit?: (event: string, payload?: unknown) => void): ReactNode {
  return fieldShell(stringProp(props, "label", "Label"), createElement("textarea", {
    value: stringProp(props, "value", ""),
    placeholder: stringProp(props, "placeholder", ""),
    readOnly: emit === undefined,
    onChange: emit === undefined ? undefined : (event: ChangeEvent<HTMLTextAreaElement>) => { emit("change", { value: event.currentTarget.value }); },
    style: { minHeight: 92, border: "1px solid #d1d5db", borderRadius: 10, padding: "8px 10px", font: "inherit", resize: "vertical" },
  }));
}

function checkbox(props: Readonly<Record<string, unknown>>, emit?: (event: string, payload?: unknown) => void): ReactNode {
  return createElement("label", { style: { display: "flex", gap: 8, alignItems: "center", fontWeight: 650 } },
    createElement("input", {
      type: "checkbox",
      checked: boolProp(props, "checked"),
      disabled: emit === undefined,
      onChange: emit === undefined ? undefined : (event: ChangeEvent<HTMLInputElement>) => { emit("change", { checked: event.currentTarget.checked }); },
    }),
    stringProp(props, "label", "Checkbox"),
  );
}

function alert(props: Readonly<Record<string, unknown>>): ReactNode {
  const tone = stringProp(props, "tone", "info");
  const background = tone === "success" ? "#ecfdf3" : tone === "warning" ? "#fff7ed" : tone === "error" ? "#fef2f2" : "#eff6ff";
  return createElement("div", {
    role: "status",
    style: { padding: 12, borderRadius: 10, background, border: "1px solid rgba(18,26,47,.12)" },
  }, stringProp(props, "text", "Alert"));
}

function progress(props: Readonly<Record<string, unknown>>): ReactNode {
  const value = numberProp(props, "value");
  return createElement("div", { style: { display: "grid", gap: 6 } },
    createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 650 } },
      createElement("span", null, stringProp(props, "label", "Progress")),
      createElement("span", null, `${value}%`),
    ),
    createElement("progress", { max: 100, value, style: { width: "100%" } }),
  );
}

const formRuntime: StudioRuntimeReactRenderer = ({ slots }) => createElement("form", {
  onSubmit: (event) => { event.preventDefault(); },
  style: { display: "grid", gap: 14 },
}, ...(slots.content ?? []));

export const workbenchRenderers = {
  ...baseWorkbenchRenderers,
  [FORM]: ({ props }: { props: Readonly<Record<string, unknown>> }) => {
    const Content = props.content as React.ComponentType<{ minEmptyHeight?: number }> | undefined;
    return createElement("form", { style: { display: "grid", gap: 14 } }, Content ? createElement(Content, { minEmptyHeight: 72 }) : null);
  },
  [TEXT_INPUT]: ({ props }: { props: Readonly<Record<string, unknown>> }) => textInput(props),
  [TEXTAREA]: ({ props }: { props: Readonly<Record<string, unknown>> }) => textarea(props),
  [CHECKBOX]: ({ props }: { props: Readonly<Record<string, unknown>> }) => checkbox(props),
  [ALERT]: ({ props }: { props: Readonly<Record<string, unknown>> }) => alert(props),
  [PROGRESS]: ({ props }: { props: Readonly<Record<string, unknown>> }) => progress(props),
};

export const runtimeRenderers: Readonly<Record<string, StudioRuntimeReactRenderer>> = {
  ...baseRuntimeRenderers,
  [FORM]: formRuntime,
  [TEXT_INPUT]: ({ props, emit }) => textInput(props, emit),
  [TEXTAREA]: ({ props, emit }) => textarea(props, emit),
  [CHECKBOX]: ({ props, emit }) => checkbox(props, emit),
  [ALERT]: ({ props }) => alert(props),
  [PROGRESS]: ({ props }) => progress(props),
};

const formTemplate = Object.freeze({
  id: "form-canvas",
  label: "Form canvas",
  description: "Build a form from editable input and feedback primitives.",
});
export const starterTemplates = Object.freeze([...baseStarterTemplates, formTemplate]);
export type StarterTemplateId = BaseStarterTemplateId | typeof formTemplate.id;

function formDocument(experienceId: string): StudioExperienceDocument {
  const nodes: StudioNode[] = [
    { id: "root", component: FORM, order: 0, props: {} },
    { id: "title", component: "airline.component.heading", parentId: "root", slot: "content", order: 0, props: { text: "Passenger details" } },
    { id: "name", component: TEXT_INPUT, parentId: "root", slot: "content", order: 1, props: { label: "Full name", value: "", placeholder: "Jane Doe" } },
    { id: "notes", component: TEXTAREA, parentId: "root", slot: "content", order: 2, props: { label: "Notes", value: "", placeholder: "Optional notes" } },
    { id: "consent", component: CHECKBOX, parentId: "root", slot: "content", order: 3, props: { label: "I confirm these details", checked: false } },
    { id: "progress", component: PROGRESS, parentId: "root", slot: "content", order: 4, props: { label: "Completion", value: 60 } },
    { id: "notice", component: ALERT, parentId: "root", slot: "content", order: 5, props: { text: "Review your details before continuing.", tone: "info" } },
    { id: "continue", component: "airline.component.button", parentId: "root", slot: "content", order: 6, props: { label: "Continue", variant: "primary" } },
  ];
  return {
    version: "1",
    id: experienceId,
    recipeId: `studio.form.${experienceId.replaceAll(".", "-")}`,
    entryView: "main",
    views: [{ id: "main", nodes }],
    bindings: [],
    interactions: [],
  };
}

export function createStarterDocument(experienceId: string, template: StarterTemplateId): StudioExperienceDocument {
  return template === formTemplate.id
    ? formDocument(experienceId)
    : createBaseStarterDocument(experienceId, template as BaseStarterTemplateId);
}

export function starterPreview(template: StarterTemplateId): ReactElement {
  if (template !== formTemplate.id) return baseStarterPreview(template as BaseStarterTemplateId);
  return createElement("div", { style: { display: "grid", gap: 10 } },
    createElement("strong", null, "Passenger details"),
    createElement("input", { readOnly: true, placeholder: "Jane Doe" }),
    createElement("progress", { max: 100, value: 60 }),
  );
}
