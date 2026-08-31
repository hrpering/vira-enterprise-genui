import type { StudioWorkbenchDocumentResult, StudioWorkbenchSession } from "@vira-enterprise-genui/studio-workbench";
import { createElement } from "react";
import type { ReactElement } from "react";
import { ViraStudioInspectorV2 } from "./inspector-v2.js";
import type { StudioWorkbenchReactIssue } from "./types.js";

export function ViraStudioInspector(props: {
  readonly session: StudioWorkbenchSession;
  readonly mutate: (result: StudioWorkbenchDocumentResult) => void;
  readonly reportError: (issue: StudioWorkbenchReactIssue) => void;
}): ReactElement {
  return createElement(ViraStudioInspectorV2, {
    session: props.session,
    mutate: props.mutate,
  });
}
