import type { JsonObject } from "@vira-enterprise-genui/protocol";
import type { ViraActionIntent } from "@vira-enterprise-genui/action-boundary";

export const VIRA_GOVERNANCE_VERSION = "1" as const;
export const VIRA_GOVERNANCE_MAX_PROVIDERS = 32 as const;
export const VIRA_GOVERNANCE_MAX_OBLIGATIONS = 64 as const;

export type ViraGovernancePlatform = "web" | "ios" | "android";
export type ViraGovernanceEffect = "allow" | "deny" | "challenge" | "transform";
export type ViraCoreSafetyEffect = "allow" | "deny";
export type ViraPrincipalKind = "user" | "agent";

export interface ViraPrincipal {
  readonly version: typeof VIRA_GOVERNANCE_VERSION;
  readonly kind: ViraPrincipalKind;
  readonly id: string;
  readonly issuer: string;
  readonly claims?: JsonObject;
}

export interface ViraGovernanceContext {
  readonly version: typeof VIRA_GOVERNANCE_VERSION;
  readonly instanceId: string;
  readonly experienceId: string;
  readonly experienceVersion: string;
  readonly platform: ViraGovernancePlatform;
  readonly userPrincipal?: ViraPrincipal;
  readonly agentPrincipal?: ViraPrincipal;
  readonly actionIntent: ViraActionIntent;
}

export interface ViraCoreSafetyVerdict {
  readonly version: typeof VIRA_GOVERNANCE_VERSION;
  readonly effect: ViraCoreSafetyEffect;
  readonly reasonCode: string;
}

export interface ViraGovernanceObligation {
  readonly id: string;
  readonly params?: JsonObject;
}

export interface ViraGovernanceVerdict {
  readonly version: typeof VIRA_GOVERNANCE_VERSION;
  readonly effect: ViraGovernanceEffect;
  readonly reasonCode: string;
  readonly obligations: readonly ViraGovernanceObligation[];
  readonly provider: string;
  readonly evidenceRef?: string;
  readonly transformedPayload?: JsonObject;
}

export interface ViraGovernanceProvider {
  readonly version: typeof VIRA_GOVERNANCE_VERSION;
  readonly id: string;
  readonly evaluate: (context: ViraGovernanceContext) => Promise<unknown> | unknown;
}

export interface ViraAgentIdentityRequest {
  readonly version: typeof VIRA_GOVERNANCE_VERSION;
  readonly instanceId: string;
  readonly credentialRef: string;
}

export interface ViraAgentIdentityProvider {
  readonly version: typeof VIRA_GOVERNANCE_VERSION;
  readonly id: string;
  readonly resolve: (request: ViraAgentIdentityRequest) => Promise<unknown> | unknown;
}

export interface ViraApprovalChallenge {
  readonly version: typeof VIRA_GOVERNANCE_VERSION;
  readonly challengeId: string;
  readonly instanceId: string;
  readonly actionId: string;
  readonly actionType: string;
  readonly provider: string;
  readonly reasonCode: string;
  readonly obligations: readonly ViraGovernanceObligation[];
}

export interface ViraApprovalDecision {
  readonly version: typeof VIRA_GOVERNANCE_VERSION;
  readonly challengeId: string;
  readonly decision: "approved" | "denied";
  readonly approver: ViraPrincipal;
  readonly evidenceRef?: string;
}

export interface ViraApprovalProvider {
  readonly version: typeof VIRA_GOVERNANCE_VERSION;
  readonly id: string;
  readonly decide: (challenge: ViraApprovalChallenge) => Promise<unknown> | unknown;
}

export interface ViraGovernancePipelineInput {
  readonly providers: readonly ViraGovernanceProvider[];
  readonly approvalProvider?: ViraApprovalProvider;
}

export interface ViraGovernanceEvaluationInput {
  readonly coreSafety: ViraCoreSafetyVerdict;
  readonly context: ViraGovernanceContext;
}

export interface ViraGovernanceEvaluationSuccess {
  readonly effect: "allow";
  readonly context: ViraGovernanceContext;
  readonly verdicts: readonly ViraGovernanceVerdict[];
  readonly approvals: readonly ViraApprovalDecision[];
}

export type ViraGovernanceIssueCode =
  | "INVALID_PIPELINE"
  | "INVALID_CONTEXT"
  | "INVALID_CORE_SAFETY"
  | "CORE_SAFETY_DENIED"
  | "INVALID_PROVIDER"
  | "PROVIDER_FAILED"
  | "INVALID_VERDICT"
  | "GOVERNANCE_DENIED"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_FAILED"
  | "INVALID_APPROVAL"
  | "TRANSFORM_INVALID";

export interface ViraGovernanceIssue {
  readonly code: ViraGovernanceIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraGovernanceEvaluationResult =
  | { readonly ok: true; readonly value: ViraGovernanceEvaluationSuccess }
  | { readonly ok: false; readonly issue: ViraGovernanceIssue; readonly challenge?: ViraApprovalChallenge };

export interface ViraGovernancePipeline {
  readonly version: typeof VIRA_GOVERNANCE_VERSION;
  readonly evaluate: (input: ViraGovernanceEvaluationInput) => Promise<ViraGovernanceEvaluationResult>;
}

export type ViraGovernancePipelineCreateResult =
  | { readonly ok: true; readonly value: ViraGovernancePipeline }
  | { readonly ok: false; readonly issue: ViraGovernanceIssue };
