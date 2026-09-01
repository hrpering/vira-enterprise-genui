import type { StudioRuntimeDispatchResult, StudioRuntimeSession } from "@vira-enterprise-genui/studio-runtime";
import type { ReactNode } from "react";

export interface StudioRuntimeReactRenderContext {
  readonly component: string;
  readonly nodeId: string;
  readonly props: Readonly<Record<string, unknown>>;
  readonly slots: Readonly<Record<string, readonly ReactNode[]>>;
  readonly emit: (event: string, payload?: unknown) => StudioRuntimeDispatchResult;
}

export type StudioRuntimeReactRenderer = (context: StudioRuntimeReactRenderContext) => ReactNode;

export type StudioRuntimeReactValidationCode =
  | "INVALID_CATALOG"
  | "INVALID_RENDERER_REGISTRY"
  | "MISSING_RENDERER"
  | "EXTRA_RENDERER"
  | "VIEW_FAILED"
  | "UNREGISTERED_COMPONENT"
  | "INVALID_SLOT_TARGET"
  | "NODE_CYCLE"
  | "RENDERER_FAILED";

export interface StudioRuntimeReactIssue {
  readonly code: StudioRuntimeReactValidationCode;
  readonly path: string;
  readonly message: string;
}

export type StudioRuntimeReactRenderResult =
  | { readonly ok: true; readonly value: ReactNode }
  | { readonly ok: false; readonly issue: StudioRuntimeReactIssue };

export interface StudioRuntimeReactInput {
  readonly session: StudioRuntimeSession;
  readonly componentCatalog: unknown;
  readonly renderers: unknown;
  /** Receives the exact canonical runtime dispatch result after a renderer event is dispatched once. */
  readonly onDispatch?: (result: StudioRuntimeDispatchResult) => void;
}
