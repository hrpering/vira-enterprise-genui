import type { StudioRuntimeReactRenderer } from "@vira-enterprise-genui/studio-runtime-react";
import { createElement } from "react";
import type { ReactNode } from "react";

export const FORM_PRIMITIVE_COMPONENTS = Object.freeze([
  Object.freeze({
    ref: "airline.form.input",
    label: "Input",
    category: "form",
    kind: "input",
    props: [
      { key: "label", type: "string", required: true, bindable: true },
      { key: "value", type: "string", required: true, bindable: true },
      { key: "placeholder", type: "string", required: true, bindable: true },
      { key: "inputType", type: "enum", required: true, bindable: false, options: ["text", "email", "date"] },
    ],
    slots: [],
    events: [{
      name: "change",
      label: "Value changed",
      payload: [{ key: "value", type: "string", required: true }],
    }],
  }),
  Object.freeze({
    ref: "airline.form.checkbox",
    label: "Checkbox",
    category: "form",
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
  }),
  Object.freeze({
    ref: "airline.status.alert",
    label: "Alert",
    category: "status",
    kind: "content",
    props: [
      { key: "text", type: "string", required: true, bindable: true },
      { key: "tone", type: "enum", required: true, bindable: false, options: ["info", "success", "warning", "error"] },
    ],
    slots: [],
    events: [],
  }),
  Object.freeze({
    ref: "airline.status.progress",
    label: "Progress",
    category: "status",
    kind: "content",
    props: [
      { key: "label", type: "string", required: true, bindable: true },
      { key: "value", type: "number", required: true, bindable: true },
    ],
    slots: [],
    events: [],
  }),
] as const);

function textProp(props: Readonly<Record<string, unknown>>, key: string, fallback: string): string {
  const value = props[key];
  return typeof value === "string" ? value : fallback;
}

function booleanProp(props: Readonly<Record<string, unknown>>, key: string, fallback: boolean): boolean {
  const value = props[key];
  return typeof value === "boolean" ? value : fallback;
}

function numberProp(props: Readonly<Record<string, unknown>>, key: string, fallback: number): number {
  const value = props[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function fieldShell(label: string, control: ReactNode): ReactNode {
  return createElement("label", {
    style: { display: "grid", gap: 6, fontSize: 13, fontWeight: 700 },
  }, label, control);
}

function inputControl(
  props: Readonly<Record<string, unknown>>,
  onChange?: (value: string) => void,
  readOnly = false,
): ReactNode {
  return fieldShell(textProp(props, "label", "Field"), createElement("input", {
    type: textProp(props, "inputType", "text"),
    value: textProp(props, "value", ""),
    placeholder: textProp(props, "placeholder", ""),
    readOnly,
    onChange: onChange
      ? (event: { target?: { value?: unknown } }) => {
          const value = event.target?.value;
          onChange(typeof value === "string" ? value : "");
        }
      : undefined,
    style: {
      minHeight: 40,
      border: "1px solid #d1d5db",
      borderRadius: 10,
      padding: "8px 10px",
      font: "inherit",
    },
  }));
}

function checkboxControl(
  props: Readonly<Record<string, unknown>>,
  onChange?: (checked: boolean) => void,
  disabled = false,
): ReactNode {
  return createElement("label", {
    style: { display: "inline-flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 700 },
  }, createElement("input", {
    type: "checkbox",
    checked: booleanProp(props, "checked", false),
    disabled,
    onChange: onChange
      ? (event: { target?: { checked?: unknown } }) => {
          onChange(event.target?.checked === true);
        }
      : undefined,
  }), textProp(props, "label", "Option"));
}

function alertControl(props: Readonly<Record<string, unknown>>): ReactNode {
  const tone = textProp(props, "tone", "info");
  const background = tone === "success"
    ? "#ecfdf3"
    : tone === "warning"
      ? "#fff7ed"
      : tone === "error"
        ? "#fef2f2"
        : "#eff6ff";
  return createElement("div", {
    role: "status",
    style: {
      padding: "10px 12px",
      borderRadius: 10,
      background,
      border: "1px solid rgba(18,26,47,.12)",
      fontSize: 13,
    },
  }, textProp(props, "text", "Status"));
}

function progressControl(props: Readonly<Record<string, unknown>>): ReactNode {
  const value = Math.max(0, Math.min(100, numberProp(props, "value", 0)));
  return createElement("div", { style: { display: "grid", gap: 6 } },
    createElement("span", { style: { fontSize: 13, fontWeight: 700 } }, textProp(props, "label", "Progress")),
    createElement("progress", { value, max: 100, style: { width: "100%" } }),
  );
}

export const FORM_PRIMITIVE_WORKBENCH_RENDERERS = Object.freeze({
  "airline.form.input": ({ props }: { props: Readonly<Record<string, unknown>> }) => inputControl(props, undefined, true),
  "airline.form.checkbox": ({ props }: { props: Readonly<Record<string, unknown>> }) => checkboxControl(props, undefined, true),
  "airline.status.alert": ({ props }: { props: Readonly<Record<string, unknown>> }) => alertControl(props),
  "airline.status.progress": ({ props }: { props: Readonly<Record<string, unknown>> }) => progressControl(props),
});

export const FORM_PRIMITIVE_RUNTIME_RENDERERS: Readonly<Record<string, StudioRuntimeReactRenderer>> = Object.freeze({
  "airline.form.input": ({ props, emit }) => inputControl(props, (value) => { emit("change", { value }); }),
  "airline.form.checkbox": ({ props, emit }) => checkboxControl(props, (checked) => { emit("change", { checked }); }),
  "airline.status.alert": ({ props }) => alertControl(props),
  "airline.status.progress": ({ props }) => progressControl(props),
});
