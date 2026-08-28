import type { ComposedExperience } from "../composition-engine/index.js";

export type ComposedExperienceValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_PLAN_ID"
  | "INVALID_MODE"
  | "INVALID_LAYOUT_POLICY"
  | "INVALID_DISCLOSURE_POLICY"
  | "INVALID_REGIONS"
  | "INVALID_MODE_REGION_COMBINATION"
  | "INVALID_SOURCE_PLAN"
  | "PLAN_ID_MISMATCH"
  | "MODE_MISMATCH"
  | "CAPABILITY_MISMATCH";

export interface ComposedExperienceValidationIssue {
  readonly code: ComposedExperienceValidationCode;
  readonly path: string;
  readonly message: string;
}

export type ComposedExperienceParseResult =
  | { readonly ok: true; readonly value: ComposedExperience }
  | { readonly ok: false; readonly issue: ComposedExperienceValidationIssue };
