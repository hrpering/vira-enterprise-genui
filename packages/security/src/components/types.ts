export const COMPONENT_ALLOWLIST_POLICY_VERSION = "1" as const;
export const COMPONENT_ALLOWLIST_MAX_ENTRIES = 256 as const;
export const COMPONENT_ALLOWLIST_KEY_MAX_LENGTH = 256 as const;

export interface ComponentAllowlistPolicy {
  readonly version: typeof COMPONENT_ALLOWLIST_POLICY_VERSION;
  readonly allowed: readonly string[];
}

export type ComponentAllowlistPolicyValidationCode =
  | "INVALID_INPUT"
  | "UNKNOWN_FIELD"
  | "INVALID_VERSION"
  | "INVALID_ALLOWED"
  | "ENTRY_LIMIT_EXCEEDED"
  | "INVALID_KEY"
  | "DUPLICATE_KEY";

export interface ComponentAllowlistPolicyValidationIssue {
  readonly code: ComponentAllowlistPolicyValidationCode;
  readonly path: string;
  readonly message: string;
}

export type ComponentAllowlistPolicyResult =
  | { readonly ok: true; readonly value: ComponentAllowlistPolicy }
  | { readonly ok: false; readonly issue: ComponentAllowlistPolicyValidationIssue };

export type ComponentAllowlistDecision = "allow" | "deny";

export interface ComponentAllowlistEvaluation {
  readonly componentKey: string;
  readonly decision: ComponentAllowlistDecision;
}

export type ComponentAllowlistEvaluationCode =
  | "INVALID_POLICY"
  | "INVALID_COMPONENT_KEY";

export interface ComponentAllowlistEvaluationIssue {
  readonly code: ComponentAllowlistEvaluationCode;
  readonly path: string;
  readonly message: string;
}

export type ComponentAllowlistEvaluationResult =
  | { readonly ok: true; readonly value: ComponentAllowlistEvaluation }
  | { readonly ok: false; readonly issue: ComponentAllowlistEvaluationIssue };
