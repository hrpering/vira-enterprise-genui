import { createUsePuck } from "@puckeditor/core";
import type { Data } from "@puckeditor/core";
import type { StudioBindingSourceDefinition } from "@vira-enterprise-genui/studio-binding";
import type { StudioCatalogPropDefinition } from "@vira-enterprise-genui/studio-catalog";
import { getStudioDesignControl, isStudioDesignPropKey } from "@vira-enterprise-genui/studio-design";
import type { StudioFlowEventOption } from "@vira-enterprise-genui/studio-flow";
import type { StudioWorkbenchDocumentResult, StudioWorkbenchSession } from "@vira-enterprise-genui/studio-workbench";
import { createElement, useState } from "react";
import type { ChangeEvent, ReactElement, ReactNode } from "react";
import type { StudioWorkbenchReactIssue } from "./types.js";

const usePuck = createUsePuck();
const outcomes = ["success", "empty", "error"] as const;
type InspectorTab = "content" | "design" | "data" | "actions";
type MutationReporter = (result: StudioWorkbenchDocumentResult) => void;

const panelStyle = Object.freeze({ padding: 14, display: "grid", gap: 14, minWidth: 260 });
const groupStyle = Object.freeze({ display: "grid", gap: 8, paddingBottom: 12, borderBottom: "1px solid rgba(127,127,127,.2)" });
const labelStyle = Object.freeze({ display: "grid", gap: 6, fontSize: 12 });
const controlStyle = Object.freeze({ width: "100%", minHeight: 34, border: "1px solid #d1d5db", borderRadius: 8, padding: "6px 8px", background: "#fff", color: "#111827" });

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function updateItems(items: readonly unknown[], puckId: string, prop: string, value: unknown): { readonly items: readonly unknown[]; readonly changed: boolean } {
  let changed = false;
  const next = items.map((item) => {
    if (!isRecord(item) || !isRecord(item.props)) return item;
    if (item.props.id === puckId) {
      const props = { ...item.props };
      if (value === undefined) delete props[prop];
      else props[prop] = value;
      changed = true;
      return { ...item, props };
    }

    let childChanged = false;
    const props = { ...item.props };
    for (const [key, candidate] of Object.entries(item.props)) {
      if (!Array.isArray(candidate)) continue;
      const nested = updateItems(candidate, puckId, prop, value);
      if (!nested.changed) continue;
      props[key] = [...nested.items];
      childChanged = true;
    }
    if (childChanged) {
      changed = true;
      return { ...item, props };
    }
    return item;
  });
  return { items: next, changed };
}

function updatePuckProp(data: Data, puckId: string, prop: string, value: unknown): Data {
  const updated = updateItems(data.content, puckId, prop, value);
  return updated.changed ? { ...data, content: updated.items as Data["content"] } : data;
}

function selectedIdentity(session: StudioWorkbenchSession): { readonly puckId: string; readonly nodeId: string; readonly component: string; readonly props: Readonly<Record<string, unknown>> } | undefined {
  const item = usePuck((state) => state.selectedItem);
  if (!item || typeof item.type !== "string" || !isRecord(item.props) || typeof item.props.id !== "string") return undefined;
  const nodeId = session.resolveNodeId(item.props.id);
  if (!nodeId) return undefined;
  return { puckId: item.props.id, nodeId, component: item.type, props: item.props };
}

function option(value: string, label: string, disabled = false): ReactElement {
  return createElement("option", { key: value || "$empty", value, disabled }, label);
}

function sourceValue(source: Pick<StudioBindingSourceDefinition, "kind" | "path">): string {
  return `${source.kind}:${source.path}`;
}

function tabButton(label: string, tab: InspectorTab, active: InspectorTab, setActive: (value: InspectorTab) => void): ReactElement {
  return createElement("button", {
    key: tab,
    type: "button",
    "data-testid": `vira-studio-inspector-${tab}`,
    onClick: () => setActive(tab),
    style: {
      border: 0,
      borderBottom: active === tab ? "2px solid #111827" : "2px solid transparent",
      padding: "10px 8px",
      background: "transparent",
      color: active === tab ? "#111827" : "#6b7280",
      cursor: "pointer",
      fontSize: 11,
      fontWeight: active === tab ? 750 : 600,
    },
  }, label);
}

function propControl(input: {
  readonly definition: StudioCatalogPropDefinition;
  readonly value: unknown;
  readonly disabled: boolean;
  readonly design: boolean;
  readonly update: (value: unknown) => void;
}): ReactElement {
  const { definition, disabled, design, update } = input;
  const value = input.value;
  const designControl = design ? getStudioDesignControl(definition.key) : undefined;
  const label = designControl?.label ?? definition.key;
  const help = disabled ? createElement("span", { style: { fontSize: 10, color: "#6b7280" } }, "Bound in Data") : null;

  if (designControl?.control === "color") {
    const color = typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value) ? value : "#111827";
    return createElement("label", { key: definition.key, style: labelStyle },
      createElement("span", null, label),
      createElement("div", { style: { display: "grid", gridTemplateColumns: "44px 1fr auto", gap: 6 } },
        createElement("input", { type: "color", value: color, disabled, onChange: (event: ChangeEvent<HTMLInputElement>) => update(event.currentTarget.value), style: { width: 44, height: 34 } }),
        createElement("input", { value: typeof value === "string" ? value : "", disabled, placeholder: "#RRGGBB", onChange: (event: ChangeEvent<HTMLInputElement>) => update(event.currentTarget.value), style: controlStyle }),
        createElement("button", { type: "button", disabled: disabled || value === undefined, onClick: () => update(undefined) }, "Clear"),
      ), help);
  }

  if (definition.type === "boolean") {
    return createElement("label", { key: definition.key, style: { ...labelStyle, gridTemplateColumns: "1fr auto", alignItems: "center" } },
      createElement("span", null, label),
      createElement("input", { type: "checkbox", checked: value === true, disabled, onChange: (event: ChangeEvent<HTMLInputElement>) => update(event.currentTarget.checked) }),
      help);
  }

  if (definition.type === "enum") {
    return createElement("label", { key: definition.key, style: labelStyle }, createElement("span", null, label),
      createElement("select", {
        value: typeof value === "string" ? value : "",
        disabled,
        onChange: (event: ChangeEvent<HTMLSelectElement>) => update(event.currentTarget.value === "" ? undefined : event.currentTarget.value),
        style: controlStyle,
      },
      definition.required ? null : option("", "Default / unset"),
      ...(definition.options ?? []).map((candidate) => option(candidate, candidate))), help);
  }

  if (definition.type === "number") {
    return createElement("label", { key: definition.key, style: labelStyle }, createElement("span", null, label),
      createElement("input", {
        type: "number",
        value: typeof value === "number" ? value : "",
        disabled,
        min: designControl?.min,
        max: designControl?.max,
        step: designControl?.step,
        onChange: (event: ChangeEvent<HTMLInputElement>) => {
          if (event.currentTarget.value === "") {
            if (!definition.required) update(undefined);
            return;
          }
          const parsed = Number(event.currentTarget.value);
          if (Number.isFinite(parsed)) update(parsed);
        },
        style: controlStyle,
      }), help);
  }

  return createElement("label", { key: definition.key, style: labelStyle }, createElement("span", null, label),
    createElement("input", {
      type: "text",
      value: typeof value === "string" ? value : "",
      disabled,
      onChange: (event: ChangeEvent<HTMLInputElement>) => update(event.currentTarget.value),
      style: controlStyle,
    }), help);
}

function StaticPropsInspector(props: { readonly session: StudioWorkbenchSession; readonly design: boolean }): ReactElement {
  const selected = selectedIdentity(props.session);
  const dispatch = usePuck((state) => state.dispatch);
  if (!selected) return createElement("div", { style: panelStyle }, "Select a component on the canvas first.");
  const component = props.session.componentCatalog().components.find((candidate) => candidate.ref === selected.component);
  if (!component) return createElement("div", { style: panelStyle }, "Selected component is not registered in the active brand.");

  const bindingTargets = props.session.bindingTargets(selected.nodeId);
  const bound = new Set(bindingTargets.ok ? bindingTargets.value.filter((target) => target.currentSource !== undefined).map((target) => target.prop) : []);
  const definitions = component.props.filter((definition) => isStudioDesignPropKey(definition.key) === props.design);
  if (definitions.length === 0) return createElement("div", { style: panelStyle }, props.design ? "This component has no approved design controls." : "This component has no editable content properties.");

  const controls = definitions.map((definition) => propControl({
    definition,
    value: selected.props[definition.key],
    disabled: bound.has(definition.key),
    design: props.design,
    update: (value) => dispatch({ type: "setData", data: (previous) => updatePuckProp(previous, selected.puckId, definition.key, value) }),
  }));
  return createElement("div", { style: panelStyle },
    createElement("div", null, createElement("strong", null, component.label), createElement("div", { style: { fontSize: 11, opacity: .6, marginTop: 3 } }, selected.nodeId)),
    ...controls,
  );
}

function DataInspector(props: { readonly session: StudioWorkbenchSession; readonly mutate: MutationReporter }): ReactElement {
  const selected = selectedIdentity(props.session);
  if (!selected) return createElement("div", { style: panelStyle }, "Select a component on the canvas first.");
  const targets = props.session.bindingTargets(selected.nodeId);
  if (!targets.ok) return createElement("div", { style: panelStyle }, targets.issue.message);
  if (targets.value.length === 0) return createElement("div", { style: panelStyle }, "This component has no bindable properties.");

  const rows = targets.value.map((target) => {
    const currentValue = target.currentSource ? sourceValue(target.currentSource) : "";
    const choices: ReactNode[] = [
      option("", target.currentSource && target.required ? "Binding required" : "Static / unbound", Boolean(target.currentSource && target.required)),
      ...target.compatibleSources.map((source) => option(sourceValue(source), source.label)),
    ];
    const onChange = (event: ChangeEvent<HTMLSelectElement>) => {
      const value = event.currentTarget.value;
      if (value === "") {
        props.mutate(props.session.clearBinding({ nodeId: selected.nodeId, prop: target.prop }));
        return;
      }
      const source = target.compatibleSources.find((candidate) => sourceValue(candidate) === value);
      if (!source) return;
      props.mutate(props.session.setBinding({ nodeId: selected.nodeId, prop: target.prop, source: { kind: source.kind, path: source.path } }));
    };
    return createElement("label", { key: target.prop, style: labelStyle },
      createElement("span", null, `${target.prop}${target.required ? " • required" : ""}`),
      createElement("select", { value: currentValue, onChange, style: controlStyle }, ...choices));
  });
  return createElement("div", { style: panelStyle }, createElement("strong", null, "Data bindings"), ...rows);
}

function routeValue(event: StudioFlowEventOption, outcome: (typeof outcomes)[number]): string {
  return event.routes.find((route) => route.outcome === outcome)?.viewId ?? "";
}

function ActionsInspector(props: { readonly session: StudioWorkbenchSession; readonly mutate: MutationReporter }): ReactElement {
  const selected = selectedIdentity(props.session);
  if (!selected) return createElement("div", { style: panelStyle }, "Select a component on the canvas first.");
  const options = props.session.flowOptions(selected.nodeId);
  if (!options.ok) return createElement("div", { style: panelStyle }, options.issue.message);
  if (options.value.events.length === 0) return createElement("div", { style: panelStyle }, "This component exposes no actions.");

  const groups = options.value.events.map((event) => {
    const actionChange = (change: ChangeEvent<HTMLSelectElement>) => {
      const actionEvent = change.currentTarget.value;
      if (actionEvent === "") {
        if (event.currentActionEvent) props.mutate(props.session.clearAction({ nodeId: selected.nodeId, event: event.event }));
        return;
      }
      props.mutate(props.session.setAction({ nodeId: selected.nodeId, event: event.event, actionEvent }));
    };
    const routeRows = outcomes.map((outcome) => {
      const currentRoute = routeValue(event, outcome);
      return createElement("label", { key: outcome, style: labelStyle }, createElement("span", null, outcome),
        createElement("select", {
          value: currentRoute,
          disabled: !event.currentActionEvent,
          onChange: (change: ChangeEvent<HTMLSelectElement>) => {
            const targetViewId = change.currentTarget.value;
            if (targetViewId === "") {
              if (currentRoute) props.mutate(props.session.clearRoute({ nodeId: selected.nodeId, event: event.event, outcome }));
              return;
            }
            props.mutate(props.session.setRoute({ nodeId: selected.nodeId, event: event.event, outcome, targetViewId }));
          },
          style: controlStyle,
        }, option("", "No route"), ...options.value.views.map((viewId) => option(viewId, viewId))));
    });
    return createElement("div", { key: event.event, style: groupStyle }, createElement("strong", null, event.label),
      createElement("label", { style: labelStyle }, createElement("span", null, "Action"),
        createElement("select", { value: event.currentActionEvent ?? "", onChange: actionChange, style: controlStyle },
          option("", "No action"), ...event.actionEvents.map((actionEvent) => option(actionEvent, actionEvent)))),
      ...routeRows);
  });
  return createElement("div", { style: panelStyle }, createElement("strong", null, "Actions & routes"), ...groups);
}

export function ViraStudioInspector(props: {
  readonly session: StudioWorkbenchSession;
  readonly mutate: MutationReporter;
  readonly reportError: (issue: StudioWorkbenchReactIssue) => void;
}): ReactElement {
  const [tab, setTab] = useState<InspectorTab>("content");
  return createElement("div", { "data-testid": "vira-studio-inspector", style: { minHeight: 0 } },
    createElement("div", { style: { position: "sticky", top: 0, zIndex: 2, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", background: "#fff", borderBottom: "1px solid #e5e7eb" } },
      tabButton("Content", "content", tab, setTab),
      tabButton("Design", "design", tab, setTab),
      tabButton("Data", "data", tab, setTab),
      tabButton("Actions", "actions", tab, setTab)),
    tab === "content" ? createElement(StaticPropsInspector, { session: props.session, design: false }) : null,
    tab === "design" ? createElement(StaticPropsInspector, { session: props.session, design: true }) : null,
    tab === "data" ? createElement(DataInspector, { session: props.session, mutate: props.mutate }) : null,
    tab === "actions" ? createElement(ActionsInspector, { session: props.session, mutate: props.mutate }) : null,
  );
}
