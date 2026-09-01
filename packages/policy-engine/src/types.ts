import type {
  CapabilityAllowlistPolicy,
  ComponentAllowlistPolicy,
  NetworkMethod,
  NetworkPolicy,
} from "@vira-enterprise-genui/security";

export const POLICY_CHECK_KINDS = Object.freeze([
  "capability",
  "component",
  "network",
] as const);

export type PolicyCheckKind = (typeof POLICY_CHECK_KINDS)[number];
export type PolicyDecision = "allow" | "deny";

export interface CapabilityPolicyCheckInput {
  readonly kind: "capability";
  readonly policy: CapabilityAllowlistPolicy;
  readonly target: string;
}

export interface ComponentPolicyCheckInput {
  readonly kind: "component";
  readonly policy: ComponentAllowlistPolicy;
  readonly target: string;
}

export interface NetworkPolicyCheckTarget {
  readonly url: string;
  readonly method: NetworkMethod;
}

export interface NetworkPolicyCheckInput {
  readonly kind: "network";
  readonly policy: NetworkPolicy;
  readonly target: NetworkPolicyCheckTarget;
}

export type PolicyCheckInput =
  | CapabilityPolicyCheckInput
  | ComponentPolicyCheckInput
  | NetworkPolicyCheckInput;

export interface PolicyCheckDecision {
  readonly kind: PolicyCheckKind;
  readonly decision: PolicyDecision;
}

export type PolicyCheckValidationCode =
  | "INVALID_INPUT"
  | "UNKNOWN_FIELD"
  | "INVALID_KIND"
  | "INVALID_POLICY"
  | "INVALID_TARGET";

export interface PolicyCheckValidationIssue {
  readonly code: PolicyCheckValidationCode;
  readonly path: string;
  readonly message: string;
}

export type PolicyCheckResult =
  | { readonly ok: true; readonly value: PolicyCheckDecision }
  | { readonly ok: false; readonly issue: PolicyCheckValidationIssue };
