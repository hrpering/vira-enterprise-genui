export const LAYOUT_FAMILIES = Object.freeze([
  "single-focus",
  "flow",
  "split",
  "comparison",
  "master-detail",
  "stepper",
  "results-list",
  "summary-action",
  "timeline",
  "dashboard",
] as const);

export type LayoutFamily = (typeof LAYOUT_FAMILIES)[number];

export interface LayoutPolicy {
  readonly family: LayoutFamily;
}

export type LayoutPolicyValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_FAMILY";

export interface LayoutPolicyValidationIssue {
  readonly code: LayoutPolicyValidationCode;
  readonly path: string;
  readonly message: string;
}

export type LayoutPolicyResult =
  | { readonly ok: true; readonly value: LayoutPolicy }
  | { readonly ok: false; readonly issue: LayoutPolicyValidationIssue };
