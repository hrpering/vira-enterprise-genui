import type { StudioPublication, StudioDependencyManifest } from "@vira-enterprise-genui/studio-compiler";
import type { StudioBinding, StudioInteraction, StudioView } from "@vira-enterprise-genui/studio-schema";

export const STUDIO_PREVIEW_VERSION = "1" as const;

export type StudioPublishValidationCode =
  | "INVALID_BINDINGS"
  | "INVALID_FLOW"
  | "COMPILATION_FAILED"
  | "VIEW_NOT_FOUND";

export interface StudioPublishValidationIssue {
  readonly code: StudioPublishValidationCode;
  readonly path: string;
  readonly message: string;
}

export type StudioPublishResult =
  | { readonly ok: true; readonly value: StudioPublication }
  | { readonly ok: false; readonly issue: StudioPublishValidationIssue };

export interface StudioPreviewDescriptor {
  readonly version: typeof STUDIO_PREVIEW_VERSION;
  readonly experienceId: string;
  readonly viewId: string;
  readonly view: StudioView;
  readonly bindings: readonly StudioBinding[];
  readonly interactions: readonly StudioInteraction[];
  readonly manifest: StudioDependencyManifest;
}

export type StudioPreviewResult =
  | { readonly ok: true; readonly value: StudioPreviewDescriptor }
  | { readonly ok: false; readonly issue: StudioPublishValidationIssue };
