import type {
  ViraEnterprisePrincipal,
  ViraEnterpriseScope,
} from "@vira-enterprise-genui/enterprise-context";
import {
  createViraGovernancePipeline,
  type ViraApprovalProvider,
  type ViraCoreSafetyVerdict,
  type ViraGovernanceContext,
  type ViraGovernanceEvaluationResult,
  type ViraGovernanceObligation,
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

export interface ViraEnterpriseGovernancePipelineInput {
  readonly scope: ViraEnterpriseScope;
  readonly principals: readonly ViraEnterprisePrincipal[];
  readonly providers: readonly ViraEnterpriseGovernanceProvider[];
  readonly approvalProvider?: ViraApprovalProvider;
  readonly allowedObligations: readonly string[];
}

export interface ViraEnterpriseGovernancePipeline {
  readonly version: typeof VIRA_ENTERPRISE_GOVERNANCE_VERSION;
  readonly scope: ViraEnterpriseScope;
  readonly evaluate: (input: {
    readonly coreSafety: ViraCoreSafetyVerdict;
    readonly context: ViraGovernanceContext;
    readonly approvals?: readonly import("@vira-enterprise-genui/governance").ViraApprovalDecision[];
  }) => Promise<ViraGovernanceEvaluationResult>;
}

export type ViraEnterpriseGovernanceCreateResult =
  | { readonly ok: true; readonly value: ViraEnterpriseGovernancePipeline }
  | { readonly ok: false; readonly issue: { readonly code: "INVALID_ENTERPRISE_GOVERNANCE"; readonly path: string; readonly message: string } };

const environmentSet = new Set(["dev", "staging", "production"]);
const idPattern = /^[a-z0-9][a-z0-9._-]{0,127}$/;

function invalid(message: string): ViraEnterpriseGovernanceCreateResult {
  return { ok: false, issue: Object.freeze({ code: "INVALID_ENTERPRISE_GOVERNANCE", path: "$", message }) };
}

function validScope(scope: ViraEnterpriseScope): boolean {
  return scope !== null
    && typeof scope === "object"
    && scope.version === "1"
    && typeof scope.organizationId === "string"
    && idPattern.test(scope.organizationId)
    && typeof scope.projectId === "string"
    && idPattern.test(scope.projectId)
    && environmentSet.has(scope.environment);
}

function validPrincipal(principal: ViraEnterprisePrincipal, organizationId: string): boolean {
  return principal !== null
    && typeof principal === "object"
    && principal.version === "1"
    && (principal.kind === "user" || principal.kind === "agent" || principal.kind === "service")
    && typeof principal.id === "string"
    && principal.id.length > 0
    && principal.id.length <= 256
    && principal.organizationId === organizationId;
}

export function createViraEnterpriseGovernancePipeline(
  input: ViraEnterpriseGovernancePipelineInput,
): ViraEnterpriseGovernanceCreateResult {
  if (input === null || typeof input !== "object" || !validScope(input.scope) || !Array.isArray(input.principals) || !Array.isArray(input.providers) || !Array.isArray(input.allowedObligations)) {
    return invalid("enterprise governance input is invalid");
  }
  if (input.principals.some((principal) => !validPrincipal(principal, input.scope.organizationId))) {
    return invalid("all enterprise principals must belong to the exact organization scope");
  }
  const principalIdentities = input.principals.map((principal) => `${principal.kind}:${principal.id}`);
  if (new Set(principalIdentities).size !== principalIdentities.length) return invalid("enterprise principal identities must be unique");

  const scope = Object.freeze({ ...input.scope });
  const principals = Object.freeze(input.principals.map((principal) => Object.freeze({ ...principal })));
  const wrapped: ViraGovernanceProvider[] = input.providers.map((provider) => {
    if (provider === null || typeof provider !== "object" || provider.version !== "1" || typeof provider.id !== "string" || typeof provider.evaluate !== "function") {
      throw new TypeError("invalid enterprise governance provider");
    }
    return Object.freeze({
      version: "1" as const,
      id: provider.id,
      evaluate(context: ViraGovernanceContext) {
        return provider.evaluate(Object.freeze({
          version: VIRA_ENTERPRISE_GOVERNANCE_VERSION,
          enterpriseScope: scope,
          enterprisePrincipals: principals,
          governance: context,
        }));
      },
    });
  });

  let core;
  try {
    core = createViraGovernancePipeline({
      providers: wrapped,
      ...(input.approvalProvider === undefined ? {} : { approvalProvider: input.approvalProvider }),
      allowedObligations: input.allowedObligations,
    });
  } catch {
    return invalid("enterprise governance providers could not be adapted");
  }
  if (!core.ok) return invalid(core.issue.message);

  const pipeline: ViraEnterpriseGovernancePipeline = Object.freeze({
    version: VIRA_ENTERPRISE_GOVERNANCE_VERSION,
    scope,
    evaluate(evaluation) {
      return core.value.evaluate(evaluation);
    },
  });
  return { ok: true, value: pipeline };
}

export type {
  ViraEnterprisePrincipal,
  ViraEnterpriseScope,
  ViraApprovalProvider,
  ViraCoreSafetyVerdict,
  ViraGovernanceContext,
  ViraGovernanceEvaluationResult,
  ViraGovernanceObligation,
};
