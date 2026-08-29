import { Puck, blocksPlugin, fieldsPlugin, outlinePlugin } from "@puckeditor/core";
import type { Config, Data, Plugin } from "@puckeditor/core";
import { createStudioPuckShellSession } from "@vira-enterprise-genui/studio-react";
import { createElement, useState } from "react";
import type { ComponentType, ReactElement } from "react";
import { createStudioWorkbenchPlugins } from "./panels.js";
import type { StudioWorkbenchReactIssue, ViraStudioWorkbenchProps } from "./types.js";

type PuckRuntimeProps = {
  readonly config: Config;
  readonly data: Data;
  readonly plugins: Plugin[];
  readonly onChange: (data: Data) => void;
  readonly onPublish: (data: Data) => void | Promise<void>;
  readonly headerTitle?: string;
  readonly height?: string | number;
  readonly iframe?: { readonly enabled?: boolean };
};

const PuckRuntime = Puck as unknown as ComponentType<PuckRuntimeProps>;

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
      ...(props.title === undefined ? {} : { headerTitle: props.title }),
      ...(props.height === undefined ? {} : { height: props.height }),
    }),
  );
}
