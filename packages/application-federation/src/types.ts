import type { ViraApplicationDistributionEnvelope } from "@vira-enterprise-genui/application-distribution";

export const VIRA_APPLICATION_FEDERATION_SCHEMA_VERSION = "1" as const;
export const VIRA_APPLICATION_FEDERATION_MAX_SOURCES = 64 as const;
export const VIRA_APPLICATION_FEDERATION_MAX_APPLICATIONS_PER_SOURCE = 512 as const;
export const VIRA_APPLICATION_FEDERATION_MAX_TOTAL_APPLICATIONS = 2_048 as const;

export interface ViraApplicationFederationSource {
  readonly sourceId: string;
  readonly applications: readonly ViraApplicationDistributionEnvelope[];
}

export interface ViraApplicationFederationSnapshot {
  readonly schemaVersion: typeof VIRA_APPLICATION_FEDERATION_SCHEMA_VERSION;
  readonly sources: readonly ViraApplicationFederationSource[];
}

export interface ViraFederatedApplicationLookup {
  readonly applicationId: string;
  readonly applicationVersion: string;
  readonly envelope: ViraApplicationDistributionEnvelope | null;
  readonly sourceIds: readonly string[];
}

export type ViraApplicationFederationIssueCode =
  | "INVALID_INPUT"
  | "UNKNOWN_FIELD"
  | "INVALID_SCHEMA_VERSION"
  | "INVALID_SOURCE"
  | "SOURCE_LIMIT_EXCEEDED"
  | "APPLICATION_LIMIT_EXCEEDED"
  | "INVALID_APPLICATION"
  | "NON_PUBLIC_APPLICATION"
  | "DUPLICATE_SOURCE"
  | "DUPLICATE_APPLICATION"
  | "FEDERATION_CONFLICT"
  | "INVALID_QUERY";

export interface ViraApplicationFederationIssue {
  readonly code: ViraApplicationFederationIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraApplicationFederationResult =
  | { readonly ok: true; readonly value: ViraApplicationFederationSnapshot }
  | { readonly ok: false; readonly issue: ViraApplicationFederationIssue };

export type ViraApplicationFederationSerializationResult =
  | { readonly ok: true; readonly value: string; readonly snapshot: ViraApplicationFederationSnapshot }
  | { readonly ok: false; readonly issue: ViraApplicationFederationIssue };

export type ViraFederatedApplicationLookupResult =
  | { readonly ok: true; readonly value: ViraFederatedApplicationLookup }
  | { readonly ok: false; readonly issue: ViraApplicationFederationIssue };
