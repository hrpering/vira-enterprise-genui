import type { ViraCanvasDraft } from "@vira-enterprise-genui/application-canvas";
import type { CompiledStudioDesignSystem } from "@vira-enterprise-genui/design-system-compiler";
import type { JsonValue } from "@vira-enterprise-genui/protocol";

export const VIRA_CANVAS_DESIGN_IMPORT_VERSION = "1" as const;
export const VIRA_CANVAS_DESIGN_IMPORT_MODE = "authoring-import" as const;
export const VIRA_CANVAS_DESIGN_SOURCE_FORMAT = "dtcg-2025.10" as const;
export const VIRA_CANVAS_DESIGN_IMPORT_MAX_SOURCE_ID_LENGTH = 128 as const;
export const VIRA_CANVAS_DESIGN_IMPORT_MAX_REVISION_LENGTH = 128 as const;

export type ViraCanvasBoundBrandReference = NonNullable<
  ViraCanvasDraft["semantics"]["application"]["brandRef"]
>;

export interface ViraCanvasExternalDesignSource {
  readonly format: typeof VIRA_CANVAS_DESIGN_SOURCE_FORMAT;
  readonly sourceId: string;
  readonly revision: string;
  readonly document: JsonValue;
}

export interface ViraCanvasDesignImportArtifact {
  readonly version: typeof VIRA_CANVAS_DESIGN_IMPORT_VERSION;
  readonly mode: typeof VIRA_CANVAS_DESIGN_IMPORT_MODE;
  readonly draftId: string;
  readonly expectedRevision: number;
  readonly brandRef: ViraCanvasBoundBrandReference;
  readonly source: ViraCanvasExternalDesignSource;
  readonly compiled: CompiledStudioDesignSystem;
}

export type ViraCanvasDesignImportIssueCode =
  | "INVALID_INPUT"
  | "INVALID_SOURCE"
  | "INVALID_SOURCE_ID"
  | "INVALID_SOURCE_REVISION"
  | "UNSUPPORTED_FORMAT"
  | "INVALID_DRAFT"
  | "BRAND_REF_REQUIRED"
  | "COMPILE_FAILED";

export interface ViraCanvasDesignImportIssue {
  readonly code: ViraCanvasDesignImportIssueCode;
  readonly path: string;
  readonly message: string;
  readonly compilerCode?: string;
}

export type ViraCanvasDesignImportResult =
  | { readonly ok: true; readonly value: ViraCanvasDesignImportArtifact }
  | { readonly ok: false; readonly issue: ViraCanvasDesignImportIssue };
