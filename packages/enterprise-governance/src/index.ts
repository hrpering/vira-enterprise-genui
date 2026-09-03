import type { ViraEnterprisePrincipal, ViraEnterpriseScope } from "@vira-enterprise-genui/enterprise-context";
import {
  createViraGovernancePipeline,
  type ViraApprovalChallenge,
  type ViraApprovalDecision,
  type ViraApprovalProvider,
  type ViraCoreSafetyVerdict,
  type ViraGovernanceContext,
  type ViraGovernanceEvaluationResult,
  type ViraGovernanceProvider,
} from "@vira-enterprise-genui/governance";

export const VIRA_ENTERPRISE_GOVERNANCE_VERSION = "1" as const;

export interface ViraEnterpriseGovernanceContext {
  readonly version: typeof VIRA_ENTERPRISE_GOVERNANCE_VERSION;
  readonly enterpriseScope: ViraEnterpriseScope;
  readonly enterprisePrincipals: readonly ViraEnterprisePrincipal[];
  readonly governance: ViraGovernanceContext;
}
export interface ViraEnterpriseGovernanceProvider {
  readonly version: typeof VIRA_ENTERPRISE_GOVERNANCE_VERSION;
  readonly id: string;
  readonly evaluate: (context: ViraEnterpriseGovernanceContext) => Promise<unknown> | unknown;
}
export interface ViraEnterpriseApprovalContext {
  readonly version: typeof VIRA_ENTERPRISE_GOVERNANCE_VERSION;
  readonly enterpriseScope: ViraEnterpriseScope;
  readonly enterprisePrincipals: readonly ViraEnterprisePrincipal[];
  readonly challenge: ViraApprovalChallenge;
}
export interface ViraEnterpriseApprovalProvider {
  readonly version: typeof VIRA_ENTERPRISE_GOVERNANCE_VERSION;
  readonly id: string;
  readonly decide: (context: ViraEnterpriseApprovalContext) => Promise<unknown> | unknown;
}
export interface ViraEnterpriseGovernancePipelineInput {
  readonly scope: ViraEnterpriseScope;
  readonly principals: readonly ViraEnterprisePrincipal[];
  readonly providers: readonly ViraEnterpriseGovernanceProvider[];
  readonly approvalProvider?: ViraEnterpriseApprovalProvider;
  readonly allowedObligations: readonly string[];
}
export interface ViraEnterpriseGovernancePipeline {
  readonly version: typeof VIRA_ENTERPRISE_GOVERNANCE_VERSION;
  readonly scope: ViraEnterpriseScope;
  readonly evaluate: (input: {
    readonly coreSafety: ViraCoreSafetyVerdict;
    readonly context: ViraGovernanceContext;
    readonly approvals?: readonly ViraApprovalDecision[];
  }) => Promise<ViraGovernanceEvaluationResult>;
}
export type ViraEnterpriseGovernanceCreateResult =
  | { readonly ok: true; readonly value: ViraEnterpriseGovernancePipeline }
  | { readonly ok: false; readonly issue: { readonly code: "INVALID_ENTERPRISE_GOVERNANCE"; readonly path: string; readonly message: string } };

const environmentSet = new Set(["dev", "staging", "production"]);
const idPattern = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const providerPattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/;
function invalid(message: string): ViraEnterpriseGovernanceCreateResult {
  return { ok: false, issue: Object.freeze({ code: "INVALID_ENTERPRISE_GOVERNANCE", path: "$", message }) };
}
function validScope(scope: ViraEnterpriseScope): boolean {
  return scope !== null && typeof scope === "object" && scope.version === "1"
    && typeof scope.organizationId === "string" && idPattern.test(scope.organizationId)
    && typeof scope.projectId === "string" && idPattern.test(scope.projectId)
    && environmentSet.has(scope.environment);
}
function validPrincipal(principal: ViraEnterprisePrincipal, organizationId: string): boolean {
  return principal !== null && typeof principal === "object" && principal.version === "1"
    && (principal.kind === "user" || principal.kind === "agent" || principal.kind === "service")
    && typeof principal.id === "string" && principal.id.length > 0 && principal.id.length <= 256
    && principal.organizationId === organizationId;
}
function validProvider(provider: ViraEnterpriseGovernanceProvider): boolean {
  return provider !== null && typeof provider === "object" && provider.version === "1"
    && typeof provider.id === "string" && provider.id.length <= 255 && providerPattern.test(provider.id)
    && typeof provider.evaluate === "function";
}
function validApprovalProvider(provider: ViraEnterpriseApprovalProvider | undefined): boolean {
  return provider === undefined || (provider !== null && typeof provider === "object" && provider.version === "1"
    && typeof provider.id === "string" && provider.id.length <= 255 && providerPattern.test(provider.id)
    && typeof provider.decide === "function");
}

export function createViraEnterpriseGovernancePipeline(input: ViraEnterpriseGovernancePipelineInput): ViraEnterpriseGovernanceCreateResult {
  if (input === null || typeof input !== "object" || !validScope(input.scope) || !Array.isArray(input.principals) || !Array.isArray(input.providers) || !Array.isArray(input.allowedObligations)) return invalid("enterprise governance input is invalid");
  if (input.principals.some((p) => !validPrincipal(p, input.scope.organizationId))) return invalid("all enterprise principals must belong to the exact organization scope");
  const principalIds = input.principals.map((p) => `${p.kind}:${p.id}`);
  if (new Set(principalIds).size !== principalIds.length) return invalid("enterprise principal identities must be unique");
  if (input.providers.some((p) => !validProvider(p)) || !validApprovalProvider(input.approvalProvider)) return invalid("enterprise governance provider configuration is invalid");
  const providerIds = input.providers.map((p) => p.id);
  if (new Set(providerIds).size !== providerIds.length) return invalid("enterprise governance provider identities must be unique");

  const scope = Object.freeze({ ...input.scope });
  const principals = Object.freeze(input.principals.map((p) => Object.freeze({ ...p })));
  const wrapped: ViraGovernanceProvider[] = input.providers.map((provider) => Object.freeze({
    version: "1" as const,
    id: provider.id,
    evaluate(context: ViraGovernanceContext) {
      return provider.evaluate(Object.freeze({ version: "1", enterpriseScope: scope, enterprisePrincipals: principals, governance: context }));
    },
  }));
  const approvalProvider: ViraApprovalProvider | undefined = input.approvalProvider === undefined ? undefined : Object.freeze({
    version: "1" as const,
    id: input.approvalProvider.id,
    decide(challenge: ViraApprovalChallenge) {
      return input.approvalProvider!.decide(Object.freeze({ version: "1", enterpriseScope: scope, enterprisePrincipals: principals, challenge }));
    },
  });
  const core = createViraGovernancePipeline({
    providers: wrapped,
    ...(approvalProvider === undefined ? {} : { approvalProvider }),
    allowedObligations: input.allowedObligations,
  });
  if (!core.ok) return invalid(core.issue.message);
  return { ok: true, value: Object.freeze({ version: "1", scope, evaluate: (evaluation) => core.value.evaluate(evaluation) }) };
}

export type { ViraEnterprisePrincipal, ViraEnterpriseScope, ViraApprovalChallenge, ViraApprovalDecision, ViraCoreSafetyVerdict, ViraGovernanceContext, ViraGovernanceEvaluationResult };
