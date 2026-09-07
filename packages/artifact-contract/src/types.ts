import type { ViraEnterpriseScope } from "@vira-enterprise-genui/enterprise-context";

export const VIRA_ARTIFACT_SCHEMA_VERSION = "1" as const;
export const VIRA_ARTIFACT_MAX_LINEAGE = 64 as const;
export const VIRA_ARTIFACT_CLASSIFICATIONS = Object.freeze([
  "public",
  "internal",
  "confidential",
  "restricted",
] as const);
export const VIRA_ARTIFACT_PRODUCER_KINDS = Object.freeze([
  "application-run",
  "studio",
  "human",
  "provider",
  "system",
] as const);
export const VIRA_ARTIFACT_SOURCE_KINDS = Object.freeze([
  "generated",
  "uploaded",
  "provider",
  "derived",
] as const);
export const VIRA_ARTIFACT_RETENTION_MODES = Object.freeze([
  "ephemeral",
  "policy",
  "legal-hold",
  "permanent",
] as const);

export type ViraArtifactClassification = (typeof VIRA_ARTIFACT_CLASSIFICATIONS)[number];
export type ViraArtifactProducerKind = (typeof VIRA_ARTIFACT_PRODUCER_KINDS)[number];
export type ViraArtifactSourceKind = (typeof VIRA_ARTIFACT_SOURCE_KINDS)[number];
export type ViraArtifactRetentionMode = (typeof VIRA_ARTIFACT_RETENTION_MODES)[number];

export interface ViraArtifactRevisionReference {
  readonly id: string;
  readonly revision: number;
  readonly digest: string;
}

export interface ViraArtifactProducer {
  readonly kind: ViraArtifactProducerKind;
  readonly id: string;
  readonly revision: number | null;
}

export interface ViraArtifactSource {
  readonly kind: ViraArtifactSourceKind;
  readonly reference: string | null;
}

export interface ViraArtifactRetention {
  readonly mode: ViraArtifactRetentionMode;
  readonly policyRef: string | null;
  readonly retainUntilUnixMs: number | null;
}

export interface ViraArtifactMetadata {
  readonly schemaVersion: typeof VIRA_ARTIFACT_SCHEMA_VERSION;
  readonly id: string;
  readonly revision: number;
  readonly scope: ViraEnterpriseScope;
  readonly digest: string;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly producer: ViraArtifactProducer;
  readonly source: ViraArtifactSource;
  readonly lineage: readonly ViraArtifactRevisionReference[];
  readonly classification: ViraArtifactClassification;
  readonly retention: ViraArtifactRetention;
  readonly createdAtUnixMs: number;
}

export type ViraArtifactValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_SCHEMA_VERSION"
  | "INVALID_ID"
  | "INVALID_REVISION"
  | "INVALID_SCOPE"
  | "INVALID_DIGEST"
  | "INVALID_MEDIA_TYPE"
  | "INVALID_BYTE_LENGTH"
  | "INVALID_PRODUCER"
  | "INVALID_SOURCE"
  | "INVALID_LINEAGE"
  | "LINEAGE_LIMIT_EXCEEDED"
  | "DUPLICATE_LINEAGE"
  | "SELF_LINEAGE"
  | "INVALID_CLASSIFICATION"
  | "INVALID_RETENTION"
  | "INVALID_CREATED_AT";

export interface ViraArtifactValidationIssue {
  readonly code: ViraArtifactValidationCode;
  readonly path: string;
  readonly message: string;
}

export type ViraArtifactResult =
  | { readonly ok: true; readonly value: ViraArtifactMetadata }
  | { readonly ok: false; readonly issue: ViraArtifactValidationIssue };

export type ViraArtifactSerializationResult =
  | { readonly ok: true; readonly value: string; readonly artifact: ViraArtifactMetadata }
  | { readonly ok: false; readonly issue: ViraArtifactValidationIssue };
