export const DISCLOSURE_LEVELS = Object.freeze(["immediate", "progressive", "on-demand", "hidden"] as const);

export type DisclosureLevel = (typeof DISCLOSURE_LEVELS)[number];
export type SupportingDisclosureLevel = "immediate" | "progressive" | "on-demand";
export type DeferredDisclosureLevel = "progressive" | "on-demand" | "hidden";

export interface DisclosurePolicy {
  readonly primary: "immediate";
  readonly supporting: SupportingDisclosureLevel;
  readonly deferred: DeferredDisclosureLevel;
}

export type DisclosurePolicyValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_PRIMARY_DISCLOSURE"
  | "INVALID_SUPPORTING_DISCLOSURE"
  | "INVALID_DEFERRED_DISCLOSURE";

export interface DisclosurePolicyValidationIssue {
  readonly code: DisclosurePolicyValidationCode;
  readonly path: string;
  readonly message: string;
}

export type DisclosurePolicyResult =
  | { readonly ok: true; readonly value: DisclosurePolicy }
  | { readonly ok: false; readonly issue: DisclosurePolicyValidationIssue };
