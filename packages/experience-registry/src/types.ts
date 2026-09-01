import type { ExperiencePackManifest } from "@vira-enterprise-genui/experience-packs";

export const EXPERIENCE_REGISTRY_SCHEMA_VERSION = "1" as const;
export const EXPERIENCE_REGISTRY_MAX_MANIFESTS = 256 as const;
export const EXPERIENCE_REGISTRY_MAX_SERIALIZED_LENGTH = 16_000_000 as const;
export const EXPERIENCE_REGISTRY_QUERY_MAX_LENGTH = 4_096 as const;

export interface ExperienceRegistrySnapshot {
  readonly schemaVersion: typeof EXPERIENCE_REGISTRY_SCHEMA_VERSION;
  readonly manifests: readonly ExperiencePackManifest[];
}

export type ExperienceRegistryValidationCode =
  | "INVALID_INPUT"
  | "INVALID_JSON"
  | "UNKNOWN_FIELD"
  | "INVALID_SCHEMA_VERSION"
  | "INVALID_MANIFESTS"
  | "MANIFEST_LIMIT_EXCEEDED"
  | "INVALID_MANIFEST"
  | "DUPLICATE_MANIFEST";

export interface ExperienceRegistryValidationIssue {
  readonly code: ExperienceRegistryValidationCode;
  readonly path: string;
  readonly message: string;
}

export type ExperienceRegistrySnapshotResult =
  | { readonly ok: true; readonly value: ExperienceRegistrySnapshot }
  | { readonly ok: false; readonly issue: ExperienceRegistryValidationIssue };

export interface ExperienceRegistryLookup {
  readonly manifest: ExperiencePackManifest | null;
}

export type ExperienceRegistryLookupCode =
  | "INVALID_SNAPSHOT"
  | "INVALID_QUERY";

export interface ExperienceRegistryLookupIssue {
  readonly code: ExperienceRegistryLookupCode;
  readonly path: string;
  readonly message: string;
}

export type ExperienceRegistryLookupResult =
  | { readonly ok: true; readonly value: ExperienceRegistryLookup }
  | { readonly ok: false; readonly issue: ExperienceRegistryLookupIssue };
