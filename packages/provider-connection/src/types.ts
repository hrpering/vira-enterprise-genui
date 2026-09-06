import type { ViraApplicationExactReference } from "@vira-enterprise-genui/application-package";
import type { ViraCapabilityExactReference } from "@vira-enterprise-genui/capability-contract";
import type { ViraEnterpriseScope, ViraSecretRef } from "@vira-enterprise-genui/enterprise-context";

export const VIRA_PROVIDER_CONNECTION_VERSION = "1" as const;
export const VIRA_PROVIDER_CONNECTION_STATES = Object.freeze(["pending", "active", "revoked", "expired"] as const);
export const VIRA_PROVIDER_CONNECTION_MAX_BINDINGS = 256 as const;
export const VIRA_PROVIDER_CONNECTION_MAX_SCOPES = 128 as const;
export type ViraProviderConnectionState = (typeof VIRA_PROVIDER_CONNECTION_STATES)[number];

export type ViraProviderOperationTarget =
  | { readonly kind: "query"; readonly capabilityRef: ViraCapabilityExactReference }
  | { readonly kind: "action"; readonly actionRef: ViraApplicationExactReference };

export interface ViraProviderOperationBinding {
  readonly operationId: string;
  readonly target: ViraProviderOperationTarget;
}

export interface ViraProviderConnection {
  readonly version: typeof VIRA_PROVIDER_CONNECTION_VERSION;
  readonly id: string;
  readonly providerId: string;
  readonly connectorId: string;
  readonly scope: ViraEnterpriseScope;
  readonly authProfileId: string;
  readonly secretRef: ViraSecretRef;
  readonly grantedScopes: readonly string[];
  readonly state: ViraProviderConnectionState;
  readonly expiresAtEpochMs: number | null;
  readonly bindings: readonly ViraProviderOperationBinding[];
}

export type ViraProviderConnectionIssueCode =
  | "INVALID_CONNECTION"
  | "INVALID_CONNECTOR"
  | "INVALID_SCOPE"
  | "INVALID_SECRET_REF"
  | "SECRET_SCOPE_MISMATCH"
  | "PROVIDER_MISMATCH"
  | "CONNECTOR_MISMATCH"
  | "UNKNOWN_AUTH_PROFILE"
  | "INVALID_GRANTED_SCOPE"
  | "DUPLICATE_GRANTED_SCOPE"
  | "MISSING_REQUIRED_SCOPE"
  | "INVALID_BINDINGS"
  | "BINDING_LIMIT_EXCEEDED"
  | "UNKNOWN_OPERATION"
  | "OPERATION_AUTH_PROFILE_MISMATCH"
  | "DUPLICATE_OPERATION_BINDING"
  | "MISSING_OPERATION_BINDING"
  | "INVALID_TARGET_REFERENCE"
  | "QUERY_REQUIRES_CAPABILITY"
  | "EFFECT_REQUIRES_ACTION"
  | "INVALID_STATE"
  | "INITIAL_STATE_REQUIRED"
  | "INVALID_EXPIRY"
  | "INVALID_TRANSITION";

export interface ViraProviderConnectionIssue {
  readonly code: ViraProviderConnectionIssueCode;
  readonly path: string;
  readonly message: string;
  readonly sourceCode?: string;
}

export type ViraProviderConnectionResult =
  | { readonly ok: true; readonly value: ViraProviderConnection }
  | { readonly ok: false; readonly issue: ViraProviderConnectionIssue };

export type ViraProviderConnectionTransition = "activate" | "revoke" | "expire";
