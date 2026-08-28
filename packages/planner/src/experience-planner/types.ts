import type { ExperiencePlan } from "@vira-enterprise-genui/protocol";

export type ExperiencePlannerValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_INTENT"
  | "STATE_RESOLUTION_FAILED"
  | "CAPABILITY_RESOLUTION_FAILED"
  | "INVALID_PLAN";

export interface ExperiencePlannerValidationIssue {
  readonly code: ExperiencePlannerValidationCode;
  readonly path: string;
  readonly message: string;
}

export type ExperiencePlannerResult =
  | { readonly ok: true; readonly value: ExperiencePlan }
  | { readonly ok: false; readonly issue: ExperiencePlannerValidationIssue };
