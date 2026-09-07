import type { ViraEnterpriseScope, ViraSecretRef } from "@vira-enterprise-genui/enterprise-context";
import type { ViraProviderConnection } from "@vira-enterprise-genui/provider-connection";

export const VIRA_PROVIDER_TRUST_VERSION = "1" as const;
export const VIRA_PROVIDER_TRUST_HEALTH_STATES = Object.freeze(["healthy", "degraded", "unhealthy"] as const);

export type ViraProviderTrustHealthState = (typeof VIRA_PROVIDER_TRUST_HEALTH_STATES)[number];

export interface ViraProviderTrustHealth {
  readonly status: ViraProviderTrustHealthState;
  readonly checkedAtEpochMs: number;
}

export interface ViraProviderTrustEvidence {
  readonly version: typeof VIRA_PROVIDER_TRUST_VERSION;
  readonly id: string;
  readonly connectionId: string;
  readonly providerId: string;
  readonly scope: ViraEnterpriseScope;
  readonly credentialRef: ViraSecretRef;
  readonly health: ViraProviderTrustHealth;
  readonly issuedAtEpochMs: number;
  readonly expiresAtEpochMs: number;
  readonly revokedAtEpochMs: number | null;
}

export interface ViraProviderTrustDecision {
  readonly version: typeof VIRA_PROVIDER_TRUST_VERSION;
  readonly trusted: true;
  readonly evidenceId: string;
  readonly connectionId: string;
  readonly providerId: string;
  readonly scope: ViraEnterpriseScope;
  readonly validUntilEpochMs: number;
}

export type ViraProviderTrustIssueCode =
  | "INVALID_EVIDENCE"
  | "INVALID_CONNECTION"
  | "INVALID_SCOPE"
  | "INVALID_CREDENTIAL_REF"
  | "INVALID_CLOCK"
  | "CONNECTION_MISMATCH"
  | "PROVIDER_MISMATCH"
  | "SCOPE_MISMATCH"
  | "CREDENTIAL_MISMATCH"
  | "CONNECTION_NOT_ACTIVE"
  | "CONNECTION_EXPIRED"
  | "EVIDENCE_NOT_YET_VALID"
  | "EVIDENCE_EXPIRED"
  | "EVIDENCE_REVOKED"
  | "HEALTH_NOT_TRUSTED";

export interface ViraProviderTrustIssue {
  readonly code: ViraProviderTrustIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraProviderTrustEvidenceResult =
  | { readonly ok: true; readonly value: ViraProviderTrustEvidence }
  | { readonly ok: false; readonly issue: ViraProviderTrustIssue };

export type ViraProviderTrustDecisionResult =
  | { readonly ok: true; readonly value: ViraProviderTrustDecision }
  | { readonly ok: false; readonly issue: ViraProviderTrustIssue };

export interface ViraProviderTrustEvaluationInput {
  readonly connection: ViraProviderConnection;
  readonly evidence: unknown;
  readonly nowEpochMs: number;
}
