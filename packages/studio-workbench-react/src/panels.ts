import { createUsePuck } from "@puckeditor/core";
import type { Plugin } from "@puckeditor/core";
import type { StudioBindingSourceDefinition } from "@vira-enterprise-genui/studio-binding";
import type { StudioFlowEventOption } from "@vira-enterprise-genui/studio-flow";
import type { StudioWorkbenchDocumentResult, StudioWorkbenchSession } from "@vira-enterprise-genui/studio-workbench";
import { createElement, useState } from "react";
import type { ChangeEvent, ReactElement, ReactNode } from "react";
import type { StudioWorkbenchReactIssue } from "./types.js";

const usePuck = createUsePuck();
const outcomes = ["success", "empty", "error"] as const;

type MutationReporter = (result: StudioWorkbenchDocumentResult) => void;
type ErrorReporter = (issue: StudioWorkbenchReactIssue) => void;

const panelStyle = Object.freeze({ padding: 16, display: "grid", gap: 14, minWidth: 260 });
const groupStyle = Object.freeze({ display: "grid", gap: 8, paddingBottom: 12, borderBottom: "1px solid rgba(127,127,127,.2)" });
const labelStyle = Object.freeze({ display: "grid", gap: 6, fontSize: 12 });
const controlStyle = Object.freeze({ width: "100%", minHeight: 34, borderRadius: 8, padding: "6px 8px" });

function useSelectedNodeId(session: StudioWorkbenchSession): string | undefined {
  const selected = usePuck((state) => state.selectedItem);
  const puckId = selected && typeof selected.props?.id === "string" ? selected.props.id : undefined;
  return puckId === undefined ? undefined : session.resolveNodeId(puckId);
}

function option(value: string, label: string, disabled = false): ReactElement {
  return createElement("option", { key: value || "$empty", value, disabled }, label);
}

function sourceValue(source: Pick<StudioBindingSourceDefinition, "kind" | "path">): string {
  return `${source.kind}:${source.path}`;
}

function EmptySelection(): ReactElement {
  return createElement("div", { style: panelStyle }, "Select a component on the canvas first.");
}

function DataPanel(props: { readonly session: StudioWorkbenchSession; readonly mutate: MutationReporter }): ReactElement {
  const nodeId = useSelectedNodeId(props.session);
  if (!nodeId) return createElement(EmptySelection);
  const targets = props.session.bindingTargets(nodeId);
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
        props.mutate(props.session.clearBinding({ nodeId, prop: target.prop }));
        return;
      }
      const source = target.compatibleSources.find((candidate) => sourceValue(candidate) === value);
      if (!source) return;
      props.mutate(props.session.setBinding({ nodeId, prop: target.prop, source: { kind: source.kind, path: source.path } }));
    };
    return createElement("label", { key: target.prop, style: labelStyle },
      createElement("span", null, `${target.prop}${target.required ? " • required" : ""}`),
      createElement("select", { value: currentValue, onChange, style: controlStyle }, ...choices),
    );
  });
  return createElement("div", { style: panelStyle }, createElement("strong", null, "Data bindings"), ...rows);
}

function routeValue(event: StudioFlowEventOption, outcome: (typeof outcomes)[number]): string {
  return event.routes.find((route) => route.outcome === outcome)?.viewId ?? "";
}

function ActionsPanel(props: { readonly session: StudioWorkbenchSession; readonly mutate: MutationReporter }): ReactElement {
  const nodeId = useSelectedNodeId(props.session);
  if (!nodeId) return createElement(EmptySelection);
  const options = props.session.flowOptions(nodeId);
  if (!options.ok) return createElement("div", { style: panelStyle }, options.issue.message);
  if (options.value.events.length === 0) return createElement("div", { style: panelStyle }, "This component exposes no actions.");

  const groups = options.value.events.map((event) => {
    const actionChange = (change: ChangeEvent<HTMLSelectElement>) => {
      const actionEvent = change.currentTarget.value;
      if (actionEvent === "") {
        if (event.currentActionEvent) props.mutate(props.session.clearAction({ nodeId, event: event.event }));
        return;
      }
      props.mutate(props.session.setAction({ nodeId, event: event.event, actionEvent }));
    };
    const routeRows = outcomes.map((outcome) => {
      const currentRoute = routeValue(event, outcome);
      const routeChange = (change: ChangeEvent<HTMLSelectElement>) => {
        const targetViewId = change.currentTarget.value;
        if (targetViewId === "") {
          if (currentRoute) props.mutate(props.session.clearRoute({ nodeId, event: event.event, outcome }));
          return;
        }
        props.mutate(props.session.setRoute({ nodeId, event: event.event, outcome, targetViewId }));
      };
      return createElement("label", { key: outcome, style: labelStyle },
        createElement("span", null, outcome),
        createElement("select", { value: currentRoute, disabled: !event.currentActionEvent, onChange: routeChange, style: controlStyle },
          option("", "No route"),
          ...options.value.views.map((viewId) => option(viewId, viewId)),
        ),
      );
    });
    return createElement("div", { key: event.event, style: groupStyle },
      createElement("strong", null, event.label),
      createElement("label", { style: labelStyle },
        createElement("span", null, "Action"),
        createElement("select", { value: event.currentActionEvent ?? "", onChange: actionChange, style: controlStyle },
          option("", "No action"),
          ...event.actionEvents.map((actionEvent) => option(actionEvent, actionEvent)),
        ),
      ),
      ...routeRows,
    );
  });
  return createElement("div", { style: panelStyle }, createElement("strong", null, "Actions & routes"), ...groups);
}

function ViewsPanel(props: { readonly session: StudioWorkbenchSession; readonly mutate: MutationReporter; readonly reportError: ErrorReporter }): ReactElement {
  const layouts = props.session.componentCatalog().components.filter((component) => component.kind === "layout");
  const [viewId, setViewId] = useState("");
  const [layoutRef, setLayoutRef] = useState(layouts[0]?.ref ?? "");
  const views = props.session.listViews();

  const viewRows = views.map((view) => createElement("div", { key: view.id, style: groupStyle },
    createElement("button", { type: "button", onClick: () => props.mutate(props.session.selectView(view.id)), style: { ...controlStyle, fontWeight: view.active ? 700 : 400 } }, `${view.id}${view.entry ? " • entry" : ""}`),
    createElement("div", { style: { display: "flex", gap: 6 } },
      createElement("button", { type: "button", disabled: view.entry, onClick: () => props.mutate(props.session.setEntryView(view.id)) }, "Set entry"),
      createElement("button", { type: "button", disabled: view.entry || views.length <= 1, onClick: () => props.mutate(props.session.removeView(view.id)) }, "Delete"),
    ),
  ));

  const add = () => {
    const normalized = viewId.trim().toLowerCase();
    if (!normalized || !layoutRef) {
      props.reportError({ code: "MUTATION_FAILED", path: "$.viewId", message: "Choose a view id and layout component." });
      return;
    }
    const result = props.session.addView({ viewId: normalized, root: { id: "root", component: layoutRef } });
    props.mutate(result);
    if (result.ok) setViewId("");
  };

  return createElement("div", { style: panelStyle },
    createElement("strong", null, "Screens / views"),
    ...viewRows,
    createElement("div", { style: groupStyle },
      createElement("strong", null, "Add screen"),
      createElement("input", { value: viewId, placeholder: "checkout", onChange: (event: ChangeEvent<HTMLInputElement>) => setViewId(event.currentTarget.value), style: controlStyle }),
      createElement("select", { value: layoutRef, onChange: (event: ChangeEvent<HTMLSelectElement>) => setLayoutRef(event.currentTarget.value), style: controlStyle }, ...layouts.map((layout) => option(layout.ref, layout.label))),
      createElement("button", { type: "button", disabled: layouts.length === 0, onClick: add }, "Add screen"),
    ),
  );
}

export function createStudioWorkbenchPlugins(input: {
  readonly session: StudioWorkbenchSession;
  readonly mutate: MutationReporter;
  readonly reportError: ErrorReporter;
}): readonly Plugin[] {
  return Object.freeze([
    { name: "vira-views", label: "Views", render: () => createElement(ViewsPanel, input) },
    { name: "vira-data", label: "Data", render: () => createElement(DataPanel, { session: input.session, mutate: input.mutate }) },
    { name: "vira-actions", label: "Actions", render: () => createElement(ActionsPanel, { session: input.session, mutate: input.mutate }) },
  ] satisfies Plugin[]);
}
