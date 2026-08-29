import { Puck, blocksPlugin, createUsePuck, fieldsPlugin, outlinePlugin } from "@puckeditor/core";
import type { Config, Data, Plugin } from "@puckeditor/core";
import { createStudioPuckShellSession } from "@vira-enterprise-genui/studio-react";
import { createElement, useState } from "react";
import type { ComponentType, ReactElement, ReactNode } from "react";
import { createStudioWorkbenchPlugins } from "./panels.js";
import type { StudioWorkbenchReactIssue, ViraStudioWorkbenchProps } from "./types.js";

const usePuck = createUsePuck();

type PuckRuntimeProps = {
  readonly config: Config;
  readonly data: Data;
  readonly plugins: Plugin[];
  readonly onChange: (data: Data) => void;
  readonly onPublish: (data: Data) => void | Promise<void>;
  readonly headerTitle?: string;
  readonly height?: string | number;
  readonly iframe?: { readonly enabled?: boolean };
  readonly dnd?: {
    readonly behavior?: "auto" | "fluid" | "static";
    readonly disableAutoScroll?: boolean;
    readonly disableOutlineDrag?: boolean;
  };
  readonly overrides?: Readonly<Record<string, unknown>>;
};

const PuckRuntime = Puck as unknown as ComponentType<PuckRuntimeProps>;

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

export function ViraStudioWorkbench(props: ViraStudioWorkbenchProps): ReactElement {
  const [revision, setRevision] = useState(0);
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
  const plugins: Plugin[] = [
    blocksPlugin({ label: "Components" }),
    outlinePlugin({ label: "Layers" }),
    ...customPlugins,
    fieldsPlugin({ label: "Properties" }),
  ];

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

  const onPublish = async (data: Data) => {
    const reconciled = props.session.reconcilePuck(data);
    if (!reconciled.ok) {
      reportError({ code: "AUTHORING_FAILED", path: reconciled.issue.path, message: reconciled.issue.message });
      setRevision((value) => value + 1);
      return;
    }
    const published = props.session.publish();
    if (!published.ok) {
      reportError({ code: "PUBLISH_FAILED", path: published.issue.path, message: published.issue.message });
      return;
    }
    setLastError(undefined);
    props.onDocumentChange?.(reconciled.value);
    await props.onPublish?.(published.value);
  };

  const overrides: Readonly<Record<string, unknown>> = {
    outline: (_overrideProps: { readonly children?: ReactNode }) => createElement(ViraLayersPanel, { session: props.session }),
  };

  return createElement("div", { style: { display: "grid", gap: 8 } },
    lastError === undefined ? null : createElement("div", { role: "alert", style: { padding: "10px 12px", borderRadius: 10, border: "1px solid currentColor" } }, lastError.message),
    createElement(PuckRuntime, {
      key: `${props.session.currentViewId()}:${revision}`,
      config: shell.value.config,
      data: shell.value.data,
      plugins,
      onChange,
      onPublish,
      iframe: { enabled: false },
      dnd: { behavior: "auto", disableOutlineDrag: true },
      overrides,
      ...(props.title === undefined ? {} : { headerTitle: props.title }),
      ...(props.height === undefined ? {} : { height: props.height }),
    }),
  );
}
