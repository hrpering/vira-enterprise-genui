import type { ViraApplicationExactReference } from "@vira-enterprise-genui/application-package";
import type { ViraApplicationEnvironmentBinding } from "@vira-enterprise-genui/deployment-plane";
import type { ViraEnterpriseScope, ViraSecretRef } from "@vira-enterprise-genui/enterprise-context";
import type { ViraProviderConnection } from "@vira-enterprise-genui/provider-connection";

export const VIRA_ACTION_SUPPLY_VERSION = "1" as const;
export const VIRA_ACTION_IDEMPOTENCY_STRATEGIES = Object.freeze([
  "provider-native",
  "read-before-write",
  "deterministic-resource-key",
  "non-repeatable",
] as const);
export const VIRA_ACTION_RETRY_SAFETY = Object.freeze([
  "safe-before-effect",
  "safe-after-known-no-effect",
  "never-after-uncertain-effect",
] as const);
export const VIRA_ACTION_VERIFICATION_STRATEGIES = Object.freeze([
  "immediate-readback",
  "eventual-readback",
  "asynchronous-job-readback",
] as const);
export const VIRA_ACTION_FRESHNESS_STRATEGIES = Object.freeze([
  "provider-version",
  "etag",
  "bounded-age",
] as const);

export type ViraActionIdempotencyStrategy = (typeof VIRA_ACTION_IDEMPOTENCY_STRATEGIES)[number];
export type ViraActionRetrySafety = (typeof VIRA_ACTION_RETRY_SAFETY)[number];
export type ViraActionVerificationStrategy = (typeof VIRA_ACTION_VERIFICATION_STRATEGIES)[number];
export type ViraActionFreshnessStrategy = (typeof VIRA_ACTION_FRESHNESS_STRATEGIES)[number];

export interface ViraActionSupplyBehavior {
  readonly idempotencyStrategy: ViraActionIdempotencyStrategy;
  readonly retrySafety: ViraActionRetrySafety;
  readonly verificationStrategy: ViraActionVerificationStrategy;
  readonly freshnessStrategy: ViraActionFreshnessStrategy;
  readonly freshnessMaxAgeMs: number | null;
}

export interface ViraActionSupplyResolutionInput {
  readonly version: typeof VIRA_ACTION_SUPPLY_VERSION;
  readonly bindingRef: ViraApplicationExactReference;
  readonly actionRef: ViraApplicationExactReference;
  readonly connection: ViraProviderConnection;
  readonly environmentBinding: ViraApplicationEnvironmentBinding;
  readonly operationId: string;
  readonly runnerRef: string;
  readonly behavior: ViraActionSupplyBehavior;
  readonly nowEpochMs: number;
}

export interface ViraResolvedActionSupply {
  readonly version: typeof VIRA_ACTION_SUPPLY_VERSION;
  readonly bindingRef: ViraApplicationExactReference;
  readonly actionRef: ViraApplicationExactReference;
  readonly scope: ViraEnterpriseScope;
  readonly providerId: string;
  readonly providerIdentityRef: string;
  readonly connectionId: string;
  readonly connectorId: string;
  readonly operationId: string;
  readonly adapterRef: string;
  readonly runnerRef: string;
  readonly secretRef: ViraSecretRef;
  readonly trustEvidenceRef: string;
  readonly behavior: ViraActionSupplyBehavior;
}

export type ViraActionSupplyIssueCode =
  | "INVALID_INPUT"
  | "INVALID_REFERENCE"
  | "INVALID_OPERATION"
  | "INVALID_RUNNER"
  | "INVALID_BEHAVIOR"
  | "CONNECTION_NOT_ACTIVE"
  | "CONNECTION_EXPIRED"
  | "ACTION_NOT_BOUND"
  | "ACTION_MISMATCH"
  | "SCOPE_MISMATCH"
  | "SECRET_MISMATCH"
  | "UNTRUSTED_ENVIRONMENT_BINDING";

export interface ViraActionSupplyIssue {
  readonly code: ViraActionSupplyIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraActionSupplyResult =
  | { readonly ok: true; readonly value: ViraResolvedActionSupply }
  | { readonly ok: false; readonly issue: ViraActionSupplyIssue };
