import type { Data } from "@puckeditor/core";
import type { ActionAdapterContract } from "@vira-enterprise-genui/adapter-sdk";
import type { StudioBindingSourceCatalog, StudioBindingTargetsResult } from "@vira-enterprise-genui/studio-binding";
import type { StudioComponentCatalog } from "@vira-enterprise-genui/studio-catalog";
import type { StudioFlowEditorOptionsResult } from "@vira-enterprise-genui/studio-flow";
import type { StudioNodeIdAllocator } from "@vira-enterprise-genui/studio-puck-authoring";
import type { StudioPreviewResult, StudioPublishResult } from "@vira-enterprise-genui/studio-publish";
import type { StudioBindingSource, StudioExperienceDocument, StudioInteractionOutcome } from "@vira-enterprise-genui/studio-schema";

export type StudioWorkbenchValidationCode =
  | "INVALID_INPUT"
  | "INVALID_VIEW"
  | "VIEW_ALREADY_EXISTS"
  | "VIEW_LIMIT_EXCEEDED"
  | "LAST_VIEW"
  | "ENTRY_VIEW"
  | "VIEW_REFERENCED"
  | "INVALID_ROOT_COMPONENT"
  | "INVALID_PUCK_SESSION"
  | "PUCK_RECONCILE_FAILED"
  | "MUTATION_FAILED";

export interface StudioWorkbenchIssue {
  readonly code: StudioWorkbenchValidationCode;
  readonly path: string;
  readonly message: string;
}

export type StudioWorkbenchDocumentResult =
  | { readonly ok: true; readonly value: StudioExperienceDocument }
  | { readonly ok: false; readonly issue: StudioWorkbenchIssue };

export interface StudioWorkbenchViewSummary {
  readonly id: string;
  readonly entry: boolean;
  readonly active: boolean;
}

export interface StudioWorkbenchAddViewInput {
  readonly viewId: string;
  readonly root: {
    readonly id: string;
    readonly component: string;
    readonly props?: Readonly<Record<string, unknown>>;
  };
}

export interface StudioWorkbenchSession {
  readonly currentDocument: () => StudioExperienceDocument;
  readonly currentViewId: () => string;
  readonly componentCatalog: () => StudioComponentCatalog;
  readonly bindingSourceCatalog: () => StudioBindingSourceCatalog;
  readonly actionAdapter: () => ActionAdapterContract;
  readonly listViews: () => readonly StudioWorkbenchViewSummary[];
  readonly selectView: (viewId: string) => StudioWorkbenchDocumentResult;
  readonly addView: (input: StudioWorkbenchAddViewInput) => StudioWorkbenchDocumentResult;
  readonly removeView: (viewId: string) => StudioWorkbenchDocumentResult;
  readonly setEntryView: (viewId: string) => StudioWorkbenchDocumentResult;
  readonly toPuckData: () => ReturnType<import("@vira-enterprise-genui/studio-puck-authoring").StudioPuckAuthoringSession["toPuckData"]>;
  readonly reconcilePuck: (data: Data) => StudioWorkbenchDocumentResult;
  readonly resolveNodeId: (puckId: string) => string | undefined;
  readonly resolvePuckId: (nodeId: string) => string | undefined;
  readonly bindingTargets: (nodeId: string) => StudioBindingTargetsResult;
  readonly setBinding: (input: { readonly nodeId: string; readonly prop: string; readonly source: StudioBindingSource }) => StudioWorkbenchDocumentResult;
  readonly clearBinding: (input: { readonly nodeId: string; readonly prop: string }) => StudioWorkbenchDocumentResult;
  readonly flowOptions: (nodeId: string) => StudioFlowEditorOptionsResult;
  readonly setAction: (input: { readonly nodeId: string; readonly event: string; readonly actionEvent: string }) => StudioWorkbenchDocumentResult;
  readonly clearAction: (input: { readonly nodeId: string; readonly event: string }) => StudioWorkbenchDocumentResult;
  readonly setRoute: (input: { readonly nodeId: string; readonly event: string; readonly outcome: StudioInteractionOutcome; readonly targetViewId: string }) => StudioWorkbenchDocumentResult;
  readonly clearRoute: (input: { readonly nodeId: string; readonly event: string; readonly outcome: StudioInteractionOutcome }) => StudioWorkbenchDocumentResult;
  readonly preview: () => StudioPreviewResult;
  readonly publish: () => StudioPublishResult;
}

export type CreateStudioWorkbenchSessionResult =
  | { readonly ok: true; readonly value: StudioWorkbenchSession }
  | { readonly ok: false; readonly issue: StudioWorkbenchIssue };

export interface CreateStudioWorkbenchSessionInput {
  readonly document: unknown;
  readonly componentCatalog: unknown;
  readonly bindingSourceCatalog: unknown;
  readonly actionAdapter: unknown;
  readonly allocateNodeId: StudioNodeIdAllocator;
  readonly initialViewId?: string;
}
