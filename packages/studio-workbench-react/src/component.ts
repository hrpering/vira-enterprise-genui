import { Puck, createUsePuck } from "@puckeditor/core";
import type { Config, Data } from "@puckeditor/core";
import { createStudioPuckShellSession } from "@vira-enterprise-genui/studio-react";
import { createElement, useState } from "react";
import type { ComponentType, ReactElement, ReactNode } from "react";
import { resolveStudioPaletteInsertionTarget } from "./palette.js";
import { createStudioWorkbenchPlugins } from "./panels.js";
import type { StudioWorkbenchReactIssue, ViraStudioWorkbenchProps } from "./types.js";

const usePuck = createUsePuck();
const PuckPreview = Puck.Preview as unknown as ComponentType;
const PuckFields = Puck.Fields as unknown as ComponentType;

type PuckRuntimeProps = {
  readonly config: Config;
  readonly data: Data;
  readonly onChange: (data: Data) => void;
  readonly iframe?: { readonly enabled?: boolean };
  readonly dnd?: {
    readonly disableAutoScroll?: boolean;
  };
  readonly children?: ReactNode;
};

const PuckRuntime = Puck as unknown as ComponentType<PuckRuntimeProps>;

type WorkbenchPanel = "components" | "layers" | "views" | "data" | "actions";

function ViraComponentsPanel(props: { readonly session: ViraStudioWorkbenchProps["session"] }): ReactElement {
  const selectedPuckId = usePuck((state) => {
    const id = state.selectedItem?.props?.id;
    return typeof id === "string" ? id : undefined;
  });
  const dispatch = usePuck((state) => state.dispatch);
  const document = props.session.currentDocument();
  const view = document.views.find((candidate) => candidate.id === props.session.currentViewId());
  if (!view) return createElement("div", { style: { padding: 16 } }, "Active Studio view not found.");

  const catalog = props.session.componentCatalog();
  const resolveTarget = () => {
    const currentDocument = props.session.currentDocument();
    const currentView = currentDocument.views.find((candidate) => candidate.id === props.session.currentViewId());
    if (!currentView) return undefined;
    return resolveStudioPaletteInsertionTarget({
      nodes: currentView.nodes,
      components: catalog.components,
      ...(selectedPuckId === undefined ? {} : { selectedId: selectedPuckId }),
    });
  };
  const target = resolveTarget();
  if (!target) return createElement("div", { style: { padding: 16 } }, "Active Studio view not found.");

  const categories = new Map<string, typeof catalog.components[number][]>();
  for (const component of catalog.components) {
    const list = categories.get(component.category) ?? [];
    list.push(component);
    categories.set(component.category, list);
  }

  const destination = target.parentId === undefined
    ? "page root"
    : `${target.parentId} · ${target.slot ?? "slot"}`;
  const insert = (componentType: string) => {
    const freshTarget = resolveTarget();
    if (!freshTarget) return;
    dispatch({
      type: "insert",
      componentType,
      destinationZone: freshTarget.zone,
      destinationIndex: freshTarget.index,
    });
  };

  return createElement("div", { style: { padding: 12, display: "grid", gap: 14 } },
    createElement("div", { style: { padding: "4px 6px", fontSize: 11, lineHeight: 1.4, color: "#6b7280" } },
      "Add components safely to ",
      createElement("strong", { style: { color: "#374151" } }, destination),
      ". Existing canvas components remain draggable for reorder and nesting.",
    ),
    ...[...categories.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([category, components]) => createElement("section", { key: category, style: { display: "grid", gap: 6 } },
        createElement("div", { style: { padding: "0 6px", fontSize: 11, fontWeight: 750, textTransform: "uppercase", letterSpacing: ".04em", color: "#6b7280" } }, category),
        ...components
          .toSorted((left, right) => left.label.localeCompare(right.label))
          .map((component) => createElement("button", {
            key: component.ref,
            type: "button",
            onClick: () => insert(component.ref),
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              width: "100%",
              border: "1px solid #e5e7eb",
              borderRadius: 9,
              padding: "9px 10px",
              background: "#fff",
              color: "#111827",
              textAlign: "left",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 650,
            },
          },
          createElement("span", null, component.label),
          createElement("span", { style: { color: "#6b7280", fontSize: 11, fontWeight: 600 } }, "Add"))),
      )),
  );
}

function ViraLayersPanel(props: { readonly session: ViraStudioWorkbenchProps["session"] }): ReactElement {
  const selectedPuckId = usePuck((state) => {
    const id = state.selectedItem?.props?.id;
    return typeof id === "string" ? id : undefined;
  });
  const dispatch = usePuck((state) => state.dispatch);
  const getSelectorForId = usePuck((state) => state.getSelectorForId);
  const document = props.session.currentDocument();
  const view = document.views.find((candidate) => candidate.id === props.session.currentViewId());
  if (!view) return createElement("div", { style: { padding: 16 } }, "Active Studio view not found.");

  const nodes = [...view.nodes];
  type LayerNode = (typeof nodes)[number];
  const labels = new Map(props.session.componentCatalog().components.map((component) => [component.ref, component.label] as const));
  const byParent = new Map<string, LayerNode[]>();
  const parentKey = (parentId: string | undefined) => parentId ?? "$root";
  for (const node of nodes) {
    const key = parentKey(node.parentId);
    const siblings = byParent.get(key) ?? [];
    siblings.push(node);
    byParent.set(key, siblings);
  }
  for (const siblings of byParent.values()) siblings.sort((left, right) => left.order - right.order);

  const selectNode = (nodeId: string) => {
    const selector = getSelectorForId(nodeId);
    if (!selector) return;
    dispatch({ type: "setUi", ui: { itemSelector: selector } });
  };

  const renderNode = (node: LayerNode, depth: number): ReactElement => {
    const children = byParent.get(parentKey(node.id)) ?? [];
    const selected = selectedPuckId === node.id;
    return createElement("li", { key: node.id, style: { listStyle: "none" } },
      createElement("button", {
        type: "button",
        onClick: () => selectNode(node.id),
        style: {
          width: "100%",
          border: 0,
          borderRadius: 8,
          padding: `8px 10px 8px ${10 + depth * 16}px`,
          background: selected ? "rgba(99,102,241,.14)" : "transparent",
          color: "inherit",
          textAlign: "left",
          cursor: "pointer",
          fontWeight: selected ? 700 : 500,
        },
      }, labels.get(node.component) ?? node.component,
      node.slot === undefined ? null : createElement("span", { style: { marginLeft: 6, opacity: .5, fontSize: 10 } }, `· ${node.slot}`)),
      children.length === 0
        ? null
        : createElement("ul", { style: { margin: 0, padding: 0 } }, ...children.map((child) => renderNode(child, depth + 1))),
    );
  };

  const roots = byParent.get("$root") ?? [];
  return createElement("div", { style: { padding: 12, minWidth: 240 } },
    createElement("div", { style: { padding: "4px 8px 10px", fontSize: 12, fontWeight: 700, opacity: .7 } }, `Layers · ${view.id}`),
    roots.length === 0
      ? createElement("div", { style: { padding: 8, opacity: .65 } }, "This view is empty.")
      : createElement("ul", { style: { margin: 0, padding: 0 } }, ...roots.map((node) => renderNode(node, 0))),
  );
}

function panelButton(label: string, value: WorkbenchPanel, active: WorkbenchPanel, select: (panel: WorkbenchPanel) => void): ReactElement {
  return createElement("button", {
    key: value,
    type: "button",
    onClick: () => select(value),
    style: {
      border: 0,
      borderRadius: 8,
      padding: "7px 9px",
      background: active === value ? "#111827" : "transparent",
      color: active === value ? "#fff" : "#374151",
      cursor: "pointer",
      fontSize: 12,
      fontWeight: 650,
    },
  }, label);
}

export function ViraStudioWorkbench(props: ViraStudioWorkbenchProps): ReactElement {
  const [revision, setRevision] = useState(0);
  const [panel, setPanel] = useState<WorkbenchPanel>("components");
  const [lastError, setLastError] = useState<StudioWorkbenchReactIssue | undefined>(undefined);
  const reportError = (issue: StudioWorkbenchReactIssue) => {
    setLastError(issue);
    props.onError?.(issue);
  };
  const notifyMutation = (result: ReturnType<typeof props.session.selectView>) => {
    if (!result.ok) {
      reportError({ code: "MUTATION_FAILED", path: result.issue.path, message: result.issue.message });
      return;
    }
    setLastError(undefined);
    props.onDocumentChange?.(result.value);
    setRevision((value) => value + 1);
  };

  const shell = createStudioPuckShellSession({
    document: props.session.currentDocument(),
    catalog: props.session.componentCatalog(),
    viewId: props.session.currentViewId(),
    renderers: props.renderers,
  });
  if (!shell.ok) return createElement("div", { role: "alert", style: { padding: 16 } }, shell.issue.message);

  const customPlugins = createStudioWorkbenchPlugins({ session: props.session, mutate: notifyMutation, reportError });
  const customPlugin = (name: string) => customPlugins.find((candidate) => candidate.name === name);

  const onChange = (data: Data) => {
    const result = props.session.reconcilePuck(data);
    if (!result.ok) {
      reportError({ code: "AUTHORING_FAILED", path: result.issue.path, message: result.issue.message });
      setRevision((value) => value + 1);
      return;
    }
    setLastError(undefined);
    props.onDocumentChange?.(result.value);
  };

  const publish = async () => {
    const published = props.session.publish();
    if (!published.ok) {
      reportError({ code: "PUBLISH_FAILED", path: published.issue.path, message: published.issue.message });
      return;
    }
    setLastError(undefined);
    await props.onPublish?.(published.value);
  };

  const renderPanel = (): ReactNode => {
    if (panel === "components") return createElement(ViraComponentsPanel, { session: props.session });
    if (panel === "layers") return createElement(ViraLayersPanel, { session: props.session });
    const pluginName = panel === "views" ? "vira-views" : panel === "data" ? "vira-data" : "vira-actions";
    const plugin = customPlugin(pluginName);
    return plugin?.render === undefined ? createElement("div", { style: { padding: 16 } }, "Panel unavailable.") : plugin.render();
  };

  const height = props.height ?? "100dvh";
  const workspace = createElement("div", {
    style: {
      height,
      minHeight: 520,
      display: "grid",
      gridTemplateRows: "48px minmax(0, 1fr)",
      background: "#f4f5f7",
      color: "#111827",
      overflow: "hidden",
      borderTop: "1px solid #e5e7eb",
    },
  },
  createElement("header", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      padding: "0 14px",
      background: "#fff",
      borderBottom: "1px solid #e5e7eb",
    },
  },
  createElement("strong", { style: { fontSize: 13 } }, props.title ?? "Vira Experience Studio"),
  createElement("button", {
    type: "button",
    onClick: () => { void publish(); },
    style: { border: 0, borderRadius: 8, padding: "8px 12px", background: "#111827", color: "#fff", cursor: "pointer", fontWeight: 700 },
  }, "Publish")),
  createElement("div", {
    style: {
      minHeight: 0,
      display: "grid",
      gridTemplateColumns: "300px minmax(360px, 1fr) 320px",
      overflow: "hidden",
    },
  },
  createElement("aside", { style: { minHeight: 0, overflow: "auto", background: "#fff", borderRight: "1px solid #e5e7eb" } },
    createElement("div", { style: { position: "sticky", top: 0, zIndex: 2, display: "flex", flexWrap: "wrap", gap: 4, padding: 8, background: "#fff", borderBottom: "1px solid #e5e7eb" } },
      panelButton("Components", "components", panel, setPanel),
      panelButton("Layers", "layers", panel, setPanel),
      panelButton("Views", "views", panel, setPanel),
      panelButton("Data", "data", panel, setPanel),
      panelButton("Actions", "actions", panel, setPanel),
    ),
    renderPanel(),
  ),
  createElement("main", { style: { minWidth: 0, minHeight: 0, overflow: "auto", padding: 18, background: "#eef0f3" } }, createElement(PuckPreview)),
  createElement("aside", { style: { minHeight: 0, overflow: "auto", background: "#fff", borderLeft: "1px solid #e5e7eb" } },
    createElement("div", { style: { padding: "12px 14px", borderBottom: "1px solid #e5e7eb", fontSize: 12, fontWeight: 750 } }, "Properties"),
    createElement(PuckFields),
  )));

  return createElement("div", { style: { display: "grid", gap: 8 } },
    lastError === undefined ? null : createElement("div", { role: "alert", style: { padding: "10px 12px", borderRadius: 10, border: "1px solid currentColor" } }, lastError.message),
    createElement(PuckRuntime, {
      key: `${props.session.currentViewId()}:${revision}`,
      config: shell.value.config,
      data: shell.value.data,
      onChange,
      iframe: { enabled: false },
    }, workspace),
  );
}
