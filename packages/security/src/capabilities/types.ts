export const CAPABILITY_ALLOWLIST_POLICY_VERSION = "1" as const;
export const CAPABILITY_ALLOWLIST_MAX_ENTRIES = 256 as const;
export const CAPABILITY_ALLOWLIST_KEY_MAX_LENGTH = 256 as const;

export interface CapabilityAllowlistPolicy {
  readonly version: typeof CAPABILITY_ALLOWLIST_POLICY_VERSION;
  readonly allowed: readonly string[];
}

export type CapabilityAllowlistPolicyValidationCode =
  | "INVALID_INPUT"
  | "UNKNOWN_FIELD"
  | "INVALID_VERSION"
  | "INVALID_ALLOWED"
  | "ENTRY_LIMIT_EXCEEDED"
  | "INVALID_KEY"
  | "DUPLICATE_KEY";

export interface CapabilityAllowlistPolicyValidationIssue {
  readonly code: CapabilityAllowlistPolicyValidationCode;
  readonly path: string;
  readonly message: string;
}

export type CapabilityAllowlistPolicyResult =
  | { readonly ok: true; readonly value: CapabilityAllowlistPolicy }
  | { readonly ok: false; readonly issue: CapabilityAllowlistPolicyValidationIssue };

export type CapabilityAllowlistDecision = "allow" | "deny";

export interface CapabilityAllowlistEvaluation {
  readonly capabilityKey: string;
  readonly decision: CapabilityAllowlistDecision;
}

export type CapabilityAllowlistEvaluationCode =
  | "INVALID_POLICY"
  | "INVALID_CAPABILITY_KEY";

export interface CapabilityAllowlistEvaluationIssue {
  readonly code: CapabilityAllowlistEvaluationCode;
  readonly path: string;
  readonly message: string;
}

export type CapabilityAllowlistEvaluationResult =
  | { readonly ok: true; readonly value: CapabilityAllowlistEvaluation }
  | { readonly ok: false; readonly issue: CapabilityAllowlistEvaluationIssue };
