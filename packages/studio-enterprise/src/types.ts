import type { StudioExperienceDocument } from "@vira-enterprise-genui/studio-schema";

export const STUDIO_PORTABLE_BUNDLE_VERSION = "1" as const;
export const STUDIO_PORTABLE_BUNDLE_MAX_BYTES = 1_048_576 as const;
export const STUDIO_AUDIT_EVENT_VERSION = "1" as const;

export interface StudioPortableBundle {
  readonly version: typeof STUDIO_PORTABLE_BUNDLE_VERSION;
  readonly brandId: string;
  readonly document: StudioExperienceDocument;
}

export type StudioEnterpriseValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_VERSION"
  | "INVALID_BRAND_ID"
  | "INVALID_DOCUMENT"
  | "BUNDLE_TOO_LARGE"
  | "INVALID_AUDIT_EVENT";

export interface StudioEnterpriseIssue {
  readonly code: StudioEnterpriseValidationCode;
  readonly path: string;
  readonly message: string;
}

export type StudioPortableBundleResult =
  | { readonly ok: true; readonly value: StudioPortableBundle }
  | { readonly ok: false; readonly issue: StudioEnterpriseIssue };

export type StudioAuditKind = "draft.save" | "publish" | "unpublish" | "import" | "export" | "brand.activate";

export interface StudioAuditEvent {
  readonly version: typeof STUDIO_AUDIT_EVENT_VERSION;
  readonly kind: StudioAuditKind;
  readonly experienceId: string;
  readonly brandId: string;
  readonly documentVersion: string;
  readonly timestamp: string;
}

export type StudioAuditEventResult =
  | { readonly ok: true; readonly value: StudioAuditEvent }
  | { readonly ok: false; readonly issue: StudioEnterpriseIssue };
