import type {
  ViraActionFreshnessStrategy,
  ViraActionIdempotencyStrategy,
  ViraActionRetrySafety,
  ViraActionVerificationStrategy,
} from "@vira-enterprise-genui/action-supply";
import type {
  ViraApplicationExactReference,
  ViraApplicationReleaseReference,
} from "@vira-enterprise-genui/application-package";
import type {
  ViraDelegationResolution,
  ViraEnterprisePrincipal,
  ViraEnterpriseScope,
  ViraSecretRef,
} from "@vira-enterprise-genui/enterprise-context";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";

export const VIRA_TRANSACTION_PLAN_SCHEMA_VERSION = "1" as const;
export const VIRA_TRANSACTION_PLAN_CANONICALIZATION_VERSION = "1" as const;
export const VIRA_TRANSACTION_RECORD_VERSION = "1" as const;
export const VIRA_TRANSACTION_MAX_OPERATIONS = 128 as const;
export const VIRA_TRANSACTION_MAX_DEPENDENCIES_PER_OPERATION = 32 as const;
export const VIRA_TRANSACTION_MAX_POLICY_REFS = 64 as const;
export const VIRA_TRANSACTION_MAX_COMMERCIAL_REFS = 128 as const;

export const VIRA_TRANSACTION_RISK_LEVELS = Object.freeze(["low", "medium", "high", "critical"] as const);
export const VIRA_TRANSACTION_REVERSIBILITY = Object.freeze(["reversible", "compensatable", "irreversible"] as const);
export const VIRA_TRANSACTION_RECORD_STATUSES = Object.freeze([
  "planned",
  "awaiting-approval",
  "approved",
  "executing",
  "verifying",
  "completed",
  "failed",
  "cancelled",
  "manual-resolution",
] as const);

export type ViraTransactionRiskLevel = (typeof VIRA_TRANSACTION_RISK_LEVELS)[number];
export type ViraTransactionReversibility = (typeof VIRA_TRANSACTION_REVERSIBILITY)[number];
export type ViraTransactionRecordStatus = (typeof VIRA_TRANSACTION_RECORD_STATUSES)[number];

export interface ViraTransactionWorkContextBinding {
  readonly id: string;
  readonly revision: number;
}

export interface ViraTransactionPolicySnapshot {
  readonly evaluationRefs: readonly string[];
  readonly obligations: JsonValue;
}

export interface ViraTransactionCommercialSnapshot {
  readonly entitlementRefs: readonly ViraApplicationExactReference[];
  readonly meteringRefs: readonly ViraApplicationExactReference[];
  readonly pricingRefs: readonly ViraApplicationExactReference[];
  readonly settlementRefs: readonly ViraApplicationExactReference[];
  readonly preflight: JsonValue;
}

export interface ViraTransactionObservedBefore {
  readonly ref: string | null;
  readonly digest: string | null;
  readonly etag: string | null;
}

export interface ViraTransactionOperation {
  readonly operationId: string;
  readonly actionRef: ViraApplicationExactReference;
  readonly actionIntent: JsonObject;
  readonly actionBindingRef: ViraApplicationExactReference;
  readonly providerIdentityRef: string;
  readonly connectionId: string;
  readonly adapterRef: string;
  readonly runnerRef: string;
  readonly secretRef: ViraSecretRef;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly observedBefore: ViraTransactionObservedBefore;
  readonly preconditions: readonly JsonObject[];
  readonly expectedPostconditions: readonly JsonObject[];
  readonly risk: ViraTransactionRiskLevel;
  readonly reversibility: ViraTransactionReversibility;
  readonly dependsOn: readonly string[];
  readonly idempotencyKey: string;
  readonly idempotencyStrategy: ViraActionIdempotencyStrategy;
  readonly retrySafety: ViraActionRetrySafety;
  readonly verificationStrategy: ViraActionVerificationStrategy;
  readonly freshnessStrategy: ViraActionFreshnessStrategy;
  readonly freshnessMaxAgeMs: number | null;
}

export interface ViraTransactionPlan {
  readonly planSchemaVersion: typeof VIRA_TRANSACTION_PLAN_SCHEMA_VERSION;
  readonly canonicalizationVersion: typeof VIRA_TRANSACTION_PLAN_CANONICALIZATION_VERSION;
  readonly transactionId: string;
  readonly applicationRef: ViraApplicationReleaseReference;
  readonly applicationDigest: string;
  readonly deploymentId: string;
  readonly resolutionDigest: string;
  readonly actor: ViraEnterprisePrincipal;
  readonly agent: ViraEnterprisePrincipal | null;
  readonly workload: ViraEnterprisePrincipal | null;
  readonly delegation: ViraDelegationResolution;
  readonly scope: ViraEnterpriseScope;
  readonly workContext: ViraTransactionWorkContextBinding;
  readonly operations: readonly ViraTransactionOperation[];
  readonly policy: ViraTransactionPolicySnapshot;
  readonly approvalRequirements: JsonValue;
  readonly commercial: ViraTransactionCommercialSnapshot;
  readonly createdAtEpochMs: number;
  readonly expiresAtEpochMs: number;
}

export interface ViraFrozenTransactionPlan {
  readonly plan: ViraTransactionPlan;
  readonly planRevision: number;
  readonly canonicalPlan: string;
  readonly planDigest: string;
}

export type ViraTransactionPlanDigestProvider = (
  canonicalPlan: string,
) => string | Promise<string>;

export interface ViraTransactionRecord {
  readonly version: typeof VIRA_TRANSACTION_RECORD_VERSION;
  readonly transactionId: string;
  readonly planDigest: string;
  readonly planRevision: number;
  readonly revision: number;
  readonly status: ViraTransactionRecordStatus;
  readonly approvals: readonly JsonValue[];
  readonly executionGrantRefs: readonly string[];
  readonly operationStates: readonly JsonValue[];
  readonly attempts: readonly JsonValue[];
  readonly verificationResults: readonly JsonValue[];
  readonly actionLedgerRefs: readonly string[];
  readonly recoveryState: JsonValue | null;
  readonly manualResolution: JsonValue | null;
  readonly createdAtEpochMs: number;
  readonly updatedAtEpochMs: number;
  readonly completedAtEpochMs: number | null;
}

export type ViraTransactionPlanIssueCode =
  | "INVALID_INPUT"
  | "UNKNOWN_FIELD"
  | "INVALID_SCHEMA_VERSION"
  | "INVALID_CANONICALIZATION_VERSION"
  | "INVALID_TRANSACTION_ID"
  | "INVALID_APPLICATION_REF"
  | "INVALID_DIGEST"
  | "INVALID_SCOPE"
  | "INVALID_PRINCIPAL"
  | "INVALID_DELEGATION"
  | "INVALID_WORK_CONTEXT"
  | "INVALID_OPERATION"
  | "OPERATION_LIMIT_EXCEEDED"
  | "DUPLICATE_OPERATION"
  | "DEPENDENCY_LIMIT_EXCEEDED"
  | "UNKNOWN_DEPENDENCY"
  | "SELF_DEPENDENCY"
  | "DEPENDENCY_CYCLE"
  | "INVALID_REFERENCE"
  | "INVALID_BEFORE_STATE"
  | "INVALID_POLICY"
  | "INVALID_COMMERCIAL_SNAPSHOT"
  | "INVALID_TIME_WINDOW"
  | "DIGEST_PROVIDER_FAILED"
  | "INVALID_PLAN_DIGEST"
  | "INVALID_PLAN_REVISION";

export interface ViraTransactionPlanIssue {
  readonly code: ViraTransactionPlanIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraTransactionPlanResult<T = ViraFrozenTransactionPlan> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: ViraTransactionPlanIssue };
