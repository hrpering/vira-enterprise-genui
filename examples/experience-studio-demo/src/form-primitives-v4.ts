import type { StudioRuntimeReactRenderer } from "@vira-enterprise-genui/studio-runtime-react";
import { createElement, useEffect, useState } from "react";
import type { ComponentType, ReactNode } from "react";

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
      { key: "input-type", type: "enum", required: true, bindable: false, options: ["text", "email", "date"] },
    ],
    slots: [],
    events: [{
      name: "change",
      label: "Value changed",
      payload: [{ key: "value", type: "string", required: true }],
    }],
  }),
  Object.freeze({
    ref: "airline.form.textarea",
    label: "Textarea",
    category: "form",
    kind: "input",
    props: [
      { key: "label", type: "string", required: true, bindable: true },
      { key: "value", type: "string", required: true, bindable: true },
      { key: "placeholder", type: "string", required: true, bindable: true },
      { key: "rows", type: "number", required: true, bindable: false },
    ],
    slots: [],
    events: [{
      name: "change",
      label: "Value changed",
      payload: [{ key: "value", type: "string", required: true }],
    }],
  }),
  Object.freeze({
    ref: "airline.form.select",
    label: "Select",
    category: "form",
    kind: "input",
    props: [
      { key: "label", type: "string", required: true, bindable: true },
      { key: "value", type: "string", required: true, bindable: true },
      { key: "option-a", type: "string", required: true, bindable: true },
      { key: "option-b", type: "string", required: true, bindable: true },
      { key: "option-c", type: "string", required: true, bindable: true },
    ],
    slots: [],
    events: [{
      name: "change",
      label: "Selection changed",
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
    ref: "airline.form.radio",
    label: "Radio group",
    category: "form",
    kind: "input",
    props: [
      { key: "legend", type: "string", required: true, bindable: true },
      { key: "value", type: "string", required: true, bindable: true },
      { key: "option-a", type: "string", required: true, bindable: true },
      { key: "option-b", type: "string", required: true, bindable: true },
      { key: "option-c", type: "string", required: true, bindable: true },
    ],
    slots: [],
    events: [{
      name: "change",
      label: "Selection changed",
      payload: [{ key: "value", type: "string", required: true }],
    }],
  }),
  Object.freeze({
    ref: "airline.form.field-group",
    label: "Field group",
    category: "form.layout",
    kind: "layout",
    props: [
      { key: "legend", type: "string", required: true, bindable: true },
    ],
    slots: [{ name: "content", label: "Fields" }],
    events: [],
  }),
  Object.freeze({
    ref: "airline.status.alert",
    label: "Alert",
    category: "status",
    kind: "feedback",
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
    kind: "feedback",
    props: [
      { key: "label", type: "string", required: true, bindable: true },
      { key: "value", type: "number", required: true, bindable: true },
    ],
    slots: [],
    events: [],
  }),
  Object.freeze({
    ref: "airline.status.spinner",
    label: "Spinner",
    category: "status",
    kind: "feedback",
    props: [
      { key: "label", type: "string", required: true, bindable: true },
    ],
    slots: [],
    events: [],
  }),
  Object.freeze({
    ref: "airline.status.empty-state",
    label: "Empty state",
    category: "status",
    kind: "feedback",
    props: [
      { key: "title", type: "string", required: true, bindable: true },
      { key: "body", type: "string", required: true, bindable: true },
    ],
    slots: [],
    events: [],
  }),
] as const);

type RuntimeEmit = Parameters<StudioRuntimeReactRenderer>[0]["emit"];
type WorkbenchSlotComponent = ComponentType<{ minEmptyHeight?: number }>;

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

const controlStyle = Object.freeze({
  width: "100%",
  minHeight: 40,
  border: "1px solid #d1d5db",
  borderRadius: 10,
  padding: "8px 10px",
  font: "inherit",
  background: "#fff",
});

function inputControl(
  props: Readonly<Record<string, unknown>>,
  value: string,
  onChange?: (value: string) => void,
  readOnly = false,
): ReactNode {
  return fieldShell(textProp(props, "label", "Field"), createElement("input", {
    type: textProp(props, "input-type", "text"),
    value,
    placeholder: textProp(props, "placeholder", ""),
    readOnly,
    onChange: onChange
      ? (event: { target?: { value?: unknown } }) => {
          const next = event.target?.value;
          onChange(typeof next === "string" ? next : "");
        }
      : undefined,
    style: controlStyle,
  }));
}

function textareaControl(
  props: Readonly<Record<string, unknown>>,
  value: string,
  onChange?: (value: string) => void,
  readOnly = false,
): ReactNode {
  const rows = Math.max(2, Math.min(12, Math.trunc(numberProp(props, "rows", 4))));
  return fieldShell(textProp(props, "label", "Notes"), createElement("textarea", {
    value,
    rows,
    placeholder: textProp(props, "placeholder", ""),
    readOnly,
    onChange: onChange
      ? (event: { target?: { value?: unknown } }) => {
          const next = event.target?.value;
          onChange(typeof next === "string" ? next : "");
        }
      : undefined,
    style: { ...controlStyle, resize: "vertical" },
  }));
}

function choiceOptions(props: Readonly<Record<string, unknown>>): readonly string[] {
  return [
    textProp(props, "option-a", "Option A"),
    textProp(props, "option-b", "Option B"),
    textProp(props, "option-c", "Option C"),
  ];
}

function selectControl(
  props: Readonly<Record<string, unknown>>,
  value: string,
  onChange?: (value: string) => void,
  disabled = false,
): ReactNode {
  return fieldShell(textProp(props, "label", "Choose an option"), createElement("select", {
    value,
    disabled,
    onChange: onChange
      ? (event: { target?: { value?: unknown } }) => {
          const next = event.target?.value;
          onChange(typeof next === "string" ? next : "");
        }
      : undefined,
    style: controlStyle,
  }, ...choiceOptions(props).map((option, index) => createElement("option", { key: `${index}:${option}`, value: option }, option))));
}

function checkboxControl(
  props: Readonly<Record<string, unknown>>,
  checked: boolean,
  onChange?: (checked: boolean) => void,
  disabled = false,
): ReactNode {
  return createElement("label", {
    style: { display: "inline-flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 700 },
  }, createElement("input", {
    type: "checkbox",
    checked,
    disabled,
    onChange: onChange
      ? (event: { target?: { checked?: unknown } }) => {
          onChange(event.target?.checked === true);
        }
      : undefined,
  }), textProp(props, "label", "Option"));
}

function radioControl(
  props: Readonly<Record<string, unknown>>,
  groupName: string,
  value: string,
  onChange?: (value: string) => void,
  disabled = false,
): ReactNode {
  return createElement("fieldset", {
    style: {
      display: "grid",
      gap: 8,
      margin: 0,
      padding: 12,
      border: "1px solid #d1d5db",
      borderRadius: 12,
    },
  },
  createElement("legend", { style: { fontSize: 13, fontWeight: 700, padding: "0 4px" } }, textProp(props, "legend", "Choose one")),
  ...choiceOptions(props).map((option, index) => createElement("label", {
    key: `${index}:${option}`,
    style: { display: "inline-flex", gap: 8, alignItems: "center", fontSize: 13 },
  }, createElement("input", {
    type: "radio",
    name: groupName,
    value: option,
    checked: value === option,
    disabled,
    onChange: onChange ? () => { onChange(option); } : undefined,
  }), option)));
}

function workbenchSlot(props: Readonly<Record<string, unknown>>): ReactNode {
  const Content = props.content as WorkbenchSlotComponent | undefined;
  return Content ? createElement(Content, { minEmptyHeight: 72 }) : null;
}

function fieldGroupControl(props: Readonly<Record<string, unknown>>, children: readonly ReactNode[]): ReactNode {
  return createElement("fieldset", {
    style: {
      display: "grid",
      gap: 12,
      margin: 0,
      padding: 16,
      border: "1px solid rgba(18,26,47,.14)",
      borderRadius: 16,
      background: "#fff",
    },
  },
  createElement("legend", { style: { padding: "0 6px", fontSize: 14, fontWeight: 800 } }, textProp(props, "legend", "Details")),
  ...children);
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

function spinnerControl(props: Readonly<Record<string, unknown>>): ReactNode {
  return createElement("div", {
    role: "status",
    "aria-live": "polite",
    style: { display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 },
  },
  createElement("span", { "aria-hidden": true, style: { fontSize: 18, lineHeight: 1 } }, "◌"),
  textProp(props, "label", "Loading"));
}

function emptyStateControl(props: Readonly<Record<string, unknown>>): ReactNode {
  return createElement("section", {
    style: {
      display: "grid",
      gap: 6,
      padding: 18,
      border: "1px dashed rgba(18,26,47,.24)",
      borderRadius: 16,
      background: "#f8fafc",
      textAlign: "center",
    },
  },
  createElement("strong", null, textProp(props, "title", "Nothing here yet")),
  createElement("span", { style: { fontSize: 13, opacity: .72 } }, textProp(props, "body", "Try changing your filters or adding an item.")));
}

function RuntimeInput({ props, emit }: { readonly props: Readonly<Record<string, unknown>>; readonly emit: RuntimeEmit }): ReactNode {
  const external = textProp(props, "value", "");
  const [value, setValue] = useState(external);
  useEffect(() => { setValue(external); }, [external]);
  return inputControl(props, value, (next) => {
    setValue(next);
    emit("change", { value: next });
  });
}

function RuntimeTextarea({ props, emit }: { readonly props: Readonly<Record<string, unknown>>; readonly emit: RuntimeEmit }): ReactNode {
  const external = textProp(props, "value", "");
  const [value, setValue] = useState(external);
  useEffect(() => { setValue(external); }, [external]);
  return textareaControl(props, value, (next) => {
    setValue(next);
    emit("change", { value: next });
  });
}

function RuntimeSelect({ props, emit }: { readonly props: Readonly<Record<string, unknown>>; readonly emit: RuntimeEmit }): ReactNode {
  const external = textProp(props, "value", choiceOptions(props)[0] ?? "");
  const [value, setValue] = useState(external);
  useEffect(() => { setValue(external); }, [external]);
  return selectControl(props, value, (next) => {
    setValue(next);
    emit("change", { value: next });
  });
}

function RuntimeCheckbox({ props, emit }: { readonly props: Readonly<Record<string, unknown>>; readonly emit: RuntimeEmit }): ReactNode {
  const external = booleanProp(props, "checked", false);
  const [checked, setChecked] = useState(external);
  useEffect(() => { setChecked(external); }, [external]);
  return checkboxControl(props, checked, (next) => {
    setChecked(next);
    emit("change", { checked: next });
  });
}

function RuntimeRadio({ props, emit, nodeId }: { readonly props: Readonly<Record<string, unknown>>; readonly emit: RuntimeEmit; readonly nodeId: string }): ReactNode {
  const external = textProp(props, "value", choiceOptions(props)[0] ?? "");
  const [value, setValue] = useState(external);
  useEffect(() => { setValue(external); }, [external]);
  return radioControl(props, `vira-radio-${nodeId}`, value, (next) => {
    setValue(next);
    emit("change", { value: next });
  });
}

export const FORM_PRIMITIVE_WORKBENCH_RENDERERS = Object.freeze({
  "airline.form.input": ({ props }: { props: Readonly<Record<string, unknown>> }) => inputControl(props, textProp(props, "value", ""), undefined, true),
  "airline.form.textarea": ({ props }: { props: Readonly<Record<string, unknown>> }) => textareaControl(props, textProp(props, "value", ""), undefined, true),
  "airline.form.select": ({ props }: { props: Readonly<Record<string, unknown>> }) => selectControl(props, textProp(props, "value", choiceOptions(props)[0] ?? ""), undefined, true),
  "airline.form.checkbox": ({ props }: { props: Readonly<Record<string, unknown>> }) => checkboxControl(props, booleanProp(props, "checked", false), undefined, true),
  "airline.form.radio": ({ props }: { props: Readonly<Record<string, unknown>> }) => radioControl(props, "vira-radio-workbench", textProp(props, "value", choiceOptions(props)[0] ?? ""), undefined, true),
  "airline.form.field-group": ({ props }: { props: Readonly<Record<string, unknown>> }) => fieldGroupControl(props, [workbenchSlot(props)]),
  "airline.status.alert": ({ props }: { props: Readonly<Record<string, unknown>> }) => alertControl(props),
  "airline.status.progress": ({ props }: { props: Readonly<Record<string, unknown>> }) => progressControl(props),
  "airline.status.spinner": ({ props }: { props: Readonly<Record<string, unknown>> }) => spinnerControl(props),
  "airline.status.empty-state": ({ props }: { props: Readonly<Record<string, unknown>> }) => emptyStateControl(props),
});

export const FORM_PRIMITIVE_RUNTIME_RENDERERS: Readonly<Record<string, StudioRuntimeReactRenderer>> = Object.freeze({
  "airline.form.input": ({ props, emit }) => createElement(RuntimeInput, { props, emit }),
  "airline.form.textarea": ({ props, emit }) => createElement(RuntimeTextarea, { props, emit }),
  "airline.form.select": ({ props, emit }) => createElement(RuntimeSelect, { props, emit }),
  "airline.form.checkbox": ({ props, emit }) => createElement(RuntimeCheckbox, { props, emit }),
  "airline.form.radio": ({ props, emit, nodeId }) => createElement(RuntimeRadio, { props, emit, nodeId }),
  "airline.form.field-group": ({ props, slots }) => fieldGroupControl(props, slots.content ?? []),
  "airline.status.alert": ({ props }) => alertControl(props),
  "airline.status.progress": ({ props }) => progressControl(props),
  "airline.status.spinner": ({ props }) => spinnerControl(props),
  "airline.status.empty-state": ({ props }) => emptyStateControl(props),
});
