import type { Data } from "@puckeditor/core";
import type { StudioPuckDataExportResult } from "@vira-enterprise-genui/studio-puck-adapter";
import type { StudioExperienceDocument } from "@vira-enterprise-genui/studio-schema";

export interface StudioNodeIdAllocationRequest {
  readonly viewId: string;
  readonly component: string;
  readonly puckId: string;
}

export type StudioNodeIdAllocator = (request: StudioNodeIdAllocationRequest) => string;

export type StudioPuckAuthoringValidationCode =
  | "INVALID_INITIAL_STATE"
  | "INVALID_ALLOCATOR"
  | "INVALID_PUCK_DATA"
  | "ID_ALLOCATION_FAILED"
  | "INVALID_ALLOCATED_ID"
  | "ALLOCATED_ID_COLLISION"
  | "IMPORT_FAILED";

export interface StudioPuckAuthoringValidationIssue {
  readonly code: StudioPuckAuthoringValidationCode;
  readonly path: string;
  readonly message: string;
}

export type StudioPuckReconcileResult =
  | { readonly ok: true; readonly value: StudioExperienceDocument }
  | { readonly ok: false; readonly issue: StudioPuckAuthoringValidationIssue };

export interface StudioPuckAuthoringSession {
  readonly viewId: string;
  readonly currentDocument: () => StudioExperienceDocument;
  readonly toPuckData: () => StudioPuckDataExportResult;
  readonly reconcile: (data: Data) => StudioPuckReconcileResult;
}

export type StudioPuckAuthoringSessionResult =
  | { readonly ok: true; readonly value: StudioPuckAuthoringSession }
  | { readonly ok: false; readonly issue: StudioPuckAuthoringValidationIssue };
