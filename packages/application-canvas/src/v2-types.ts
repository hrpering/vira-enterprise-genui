import type { ViraApplicationGraphV2 } from "@vira-enterprise-genui/application-graph";
import type { ViraApplicationPackageV2 } from "@vira-enterprise-genui/application-package";
import type {
  ViraCanvasGraphRef,
  ViraCanvasGraphView,
  ViraCanvasProjection,
  ViraCanvasValidationIssue,
} from "./types.js";

export const VIRA_CANVAS_DRAFT_V2_SCHEMA_VERSION = "2" as const;

export interface ViraCanvasSemanticsV2 {
  readonly application: ViraApplicationPackageV2;
  readonly graphs: readonly ViraApplicationGraphV2[];
}

export interface ViraCanvasDraftV2 {
  readonly schemaVersion: typeof VIRA_CANVAS_DRAFT_V2_SCHEMA_VERSION;
  readonly draftId: string;
  readonly editorRevision: number;
  readonly semantics: ViraCanvasSemanticsV2;
  readonly projection: ViraCanvasProjection;
}

export type ViraCanvasDraftV2Result =
  | { readonly ok: true; readonly value: ViraCanvasDraftV2 }
  | { readonly ok: false; readonly issue: ViraCanvasValidationIssue };

export type ViraCanvasDraftV2SerializationResult =
  | { readonly ok: true; readonly value: string; readonly draft: ViraCanvasDraftV2 }
  | { readonly ok: false; readonly issue: ViraCanvasValidationIssue };

export type ViraCanvasSemanticsV2Result =
  | { readonly ok: true; readonly value: ViraCanvasSemanticsV2 }
  | { readonly ok: false; readonly issue: ViraCanvasValidationIssue };

export type ViraCanvasSemanticsV2SerializationResult =
  | { readonly ok: true; readonly value: string; readonly semantics: ViraCanvasSemanticsV2 }
  | { readonly ok: false; readonly issue: ViraCanvasValidationIssue };

export type ViraCanvasGraphRefV2 = ViraCanvasGraphRef;
export type ViraCanvasGraphViewV2 = ViraCanvasGraphView;
