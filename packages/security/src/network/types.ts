export const NETWORK_POLICY_VERSION = "1" as const;
export const NETWORK_POLICY_MAX_RULES = 64 as const;
export const NETWORK_METHODS = Object.freeze([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
] as const);

export type NetworkMethod = (typeof NETWORK_METHODS)[number];

export interface NetworkPolicyRule {
  readonly origin: string;
  readonly methods: readonly NetworkMethod[];
}

export interface NetworkPolicy {
  readonly version: typeof NETWORK_POLICY_VERSION;
  readonly rules: readonly NetworkPolicyRule[];
}

export type NetworkPolicyValidationCode =
  | "INVALID_INPUT"
  | "UNKNOWN_FIELD"
  | "INVALID_VERSION"
  | "INVALID_RULES"
  | "RULE_LIMIT_EXCEEDED"
  | "INVALID_RULE"
  | "INVALID_ORIGIN"
  | "DUPLICATE_ORIGIN"
  | "INVALID_METHODS"
  | "DUPLICATE_METHOD";

export interface NetworkPolicyValidationIssue {
  readonly code: NetworkPolicyValidationCode;
  readonly path: string;
  readonly message: string;
}

export type NetworkPolicyResult =
  | { readonly ok: true; readonly value: NetworkPolicy }
  | { readonly ok: false; readonly issue: NetworkPolicyValidationIssue };

export interface NetworkRequest {
  readonly url: string;
  readonly origin: string;
  readonly method: NetworkMethod;
}

export type NetworkDecision = "allow" | "deny";
export type NetworkDecisionReason = "allowed" | "origin-not-allowed" | "method-not-allowed";

export interface NetworkRequestEvaluation {
  readonly request: NetworkRequest;
  readonly decision: NetworkDecision;
  readonly reason: NetworkDecisionReason;
}

export type NetworkRequestEvaluationCode =
  | "INVALID_POLICY"
  | "INVALID_REQUEST"
  | "INVALID_URL"
  | "INVALID_METHOD";

export interface NetworkRequestEvaluationIssue {
  readonly code: NetworkRequestEvaluationCode;
  readonly path: string;
  readonly message: string;
}

export type NetworkRequestEvaluationResult =
  | { readonly ok: true; readonly value: NetworkRequestEvaluation }
  | { readonly ok: false; readonly issue: NetworkRequestEvaluationIssue };
