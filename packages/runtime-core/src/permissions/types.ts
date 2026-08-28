export const RUNTIME_PERMISSION_POLICY_VERSION = "1" as const;
export const RUNTIME_PERMISSION_MAX_RULES = 512 as const;
export const RUNTIME_PERMISSION_EFFECTS = Object.freeze(["allow", "deny", "confirm"] as const);
export const RUNTIME_PERMISSION_SUBJECTS = Object.freeze(["action", "capability"] as const);

export type RuntimePermissionEffect = (typeof RUNTIME_PERMISSION_EFFECTS)[number];
export type RuntimePermissionSubject = (typeof RUNTIME_PERMISSION_SUBJECTS)[number];

export interface RuntimePermissionRule {
  readonly subject: RuntimePermissionSubject;
  readonly id: string;
  readonly effect: RuntimePermissionEffect;
}

export interface RuntimePermissionPolicy {
  readonly version: typeof RUNTIME_PERMISSION_POLICY_VERSION;
  readonly rules: readonly RuntimePermissionRule[];
}

export type RuntimePermissionPolicyValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_VERSION"
  | "INVALID_RULES"
  | "RULE_LIMIT_EXCEEDED"
  | "INVALID_RULE"
  | "DUPLICATE_RULE";

export interface RuntimePermissionPolicyValidationIssue {
  readonly code: RuntimePermissionPolicyValidationCode;
  readonly path: string;
  readonly message: string;
}

export type RuntimePermissionPolicyCreateResult =
  | { readonly ok: true; readonly value: RuntimePermissionPolicy }
  | { readonly ok: false; readonly issue: RuntimePermissionPolicyValidationIssue };

export interface RuntimePermissionDecision {
  readonly effect: RuntimePermissionEffect;
  readonly reason: "matched-rule" | "default-deny";
  readonly subject: RuntimePermissionSubject;
  readonly id: string;
}

export type RuntimePermissionEvaluationCode = "INVALID_ACTION" | "INVALID_CAPABILITY";

export interface RuntimePermissionEvaluationIssue {
  readonly code: RuntimePermissionEvaluationCode;
  readonly path: string;
  readonly message: string;
}

export type RuntimePermissionEvaluationResult =
  | { readonly ok: true; readonly value: RuntimePermissionDecision }
  | { readonly ok: false; readonly issue: RuntimePermissionEvaluationIssue };
