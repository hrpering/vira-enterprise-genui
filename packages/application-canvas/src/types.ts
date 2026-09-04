import type { ViraApplicationGraph } from "@vira-enterprise-genui/application-graph";
import type { ViraApplicationPackage } from "@vira-enterprise-genui/application-package";

export const VIRA_CANVAS_DRAFT_SCHEMA_VERSION = "1" as const;
export const VIRA_CANVAS_DRAFT_ID_MAX_LENGTH = 128 as const;
export const VIRA_CANVAS_MAX_GRAPHS = 64 as const;
export const VIRA_CANVAS_MAX_GRAPH_VIEWS = 64 as const;
export const VIRA_CANVAS_MAX_NODE_LAYOUTS = 256 as const;
export const VIRA_CANVAS_MAX_SELECTED_NODES = 256 as const;
export const VIRA_CANVAS_MAX_SELECTED_EDGES = 1_024 as const;
export const VIRA_CANVAS_MAX_COORDINATE = 1_000_000 as const;
export const VIRA_CANVAS_MIN_ZOOM = 0.05 as const;
export const VIRA_CANVAS_MAX_ZOOM = 16 as const;

export interface ViraCanvasGraphRef {
  readonly id: string;
  readonly version: string;
}

export interface ViraCanvasNodeLayout {
  readonly nodeId: string;
  readonly x: number;
  readonly y: number;
}

export interface ViraCanvasViewport {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export interface ViraCanvasSelection {
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
}

export interface ViraCanvasGraphView {
  readonly graphRef: ViraCanvasGraphRef;
  readonly nodeLayouts: readonly ViraCanvasNodeLayout[];
  readonly viewport: ViraCanvasViewport;
  readonly selection: ViraCanvasSelection;
}

export interface ViraCanvasProjection {
  readonly activeGraphRef: ViraCanvasGraphRef | null;
  readonly graphViews: readonly ViraCanvasGraphView[];
}

export interface ViraCanvasSemantics {
  readonly application: ViraApplicationPackage;
  readonly graphs: readonly ViraApplicationGraph[];
}

export interface ViraCanvasDraft {
  readonly schemaVersion: typeof VIRA_CANVAS_DRAFT_SCHEMA_VERSION;
  readonly draftId: string;
  readonly editorRevision: number;
  readonly semantics: ViraCanvasSemantics;
  readonly projection: ViraCanvasProjection;
}

export type ViraCanvasValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_SCHEMA_VERSION"
  | "INVALID_DRAFT_ID"
  | "INVALID_EDITOR_REVISION"
  | "INVALID_SEMANTICS"
  | "INVALID_APPLICATION"
  | "INVALID_GRAPH"
  | "GRAPH_LIMIT_EXCEEDED"
  | "DUPLICATE_GRAPH"
  | "INVALID_PROJECTION"
  | "GRAPH_VIEW_LIMIT_EXCEEDED"
  | "DUPLICATE_GRAPH_VIEW"
  | "GRAPH_NOT_FOUND"
  | "INVALID_NODE_LAYOUT"
  | "NODE_LAYOUT_LIMIT_EXCEEDED"
  | "DUPLICATE_NODE_LAYOUT"
  | "NODE_NOT_FOUND"
  | "INVALID_VIEWPORT"
  | "INVALID_SELECTION"
  | "SELECTION_LIMIT_EXCEEDED"
  | "DUPLICATE_SELECTION"
  | "SELECTION_TARGET_NOT_FOUND";

export interface ViraCanvasValidationIssue {
  readonly code: ViraCanvasValidationCode;
  readonly path: string;
  readonly message: string;
}

export type ViraCanvasDraftResult =
  | { readonly ok: true; readonly value: ViraCanvasDraft }
  | { readonly ok: false; readonly issue: ViraCanvasValidationIssue };

export type ViraCanvasDraftSerializationResult =
  | { readonly ok: true; readonly value: string; readonly draft: ViraCanvasDraft }
  | { readonly ok: false; readonly issue: ViraCanvasValidationIssue };

export type ViraCanvasSemanticsResult =
  | { readonly ok: true; readonly value: ViraCanvasSemantics }
  | { readonly ok: false; readonly issue: ViraCanvasValidationIssue };

export type ViraCanvasSemanticsSerializationResult =
  | { readonly ok: true; readonly value: string; readonly semantics: ViraCanvasSemantics }
  | { readonly ok: false; readonly issue: ViraCanvasValidationIssue };
