export const EXPERIENCE_PACK_SCHEMA_VERSION = "1" as const;
export const EXPERIENCE_PACK_MAX_ARTIFACTS = 128 as const;
export const EXPERIENCE_PACK_MAX_ENTRYPOINTS = 16 as const;
export const EXPERIENCE_PACK_MAX_TAGS = 32 as const;
export const EXPERIENCE_PACK_MAX_NAME_LENGTH = 120 as const;
export const EXPERIENCE_PACK_MAX_DESCRIPTION_LENGTH = 2_000 as const;
export const EXPERIENCE_PACK_MAX_ARTIFACT_SIZE_BYTES = 10_000_000_000 as const;

export const EXPERIENCE_PACK_ALLOWED_MEDIA_TYPES = Object.freeze({
  "studio-publication": Object.freeze(["application/json"]),
  asset: Object.freeze([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/avif",
  ]),
} as const);

export type ExperiencePackArtifactRole = keyof typeof EXPERIENCE_PACK_ALLOWED_MEDIA_TYPES;

export interface ExperiencePackPublisher {
  readonly id: string;
  readonly name: string;
}

export interface ExperiencePackMetadata {
  readonly name: string;
  readonly description?: string;
  readonly tags: readonly string[];
}

export interface ExperiencePackCompatibility {
  readonly minViraVersion: string;
  readonly maxViraVersion?: string;
}

export interface ExperiencePackArtifactDescriptor {
  readonly id: string;
  readonly role: ExperiencePackArtifactRole;
  readonly mediaType: string;
  readonly digest: string;
  readonly size: number;
}

export interface ExperiencePackManifest {
  readonly schemaVersion: typeof EXPERIENCE_PACK_SCHEMA_VERSION;
  readonly id: string;
  readonly version: string;
  readonly publisher: ExperiencePackPublisher;
  readonly metadata: ExperiencePackMetadata;
  readonly compatibility: ExperiencePackCompatibility;
  readonly entrypoints: readonly string[];
  readonly artifacts: readonly ExperiencePackArtifactDescriptor[];
}

export type ExperiencePackValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_SCHEMA_VERSION"
  | "INVALID_ID"
  | "INVALID_VERSION"
  | "INVALID_PUBLISHER"
  | "INVALID_METADATA"
  | "INVALID_COMPATIBILITY"
  | "INVALID_ARTIFACT"
  | "ARTIFACT_LIMIT_EXCEEDED"
  | "DUPLICATE_ARTIFACT"
  | "UNSAFE_MEDIA_TYPE"
  | "INVALID_ENTRYPOINT"
  | "ENTRYPOINT_LIMIT_EXCEEDED"
  | "DUPLICATE_ENTRYPOINT";

export interface ExperiencePackValidationIssue {
  readonly code: ExperiencePackValidationCode;
  readonly path: string;
  readonly message: string;
}

export type ExperiencePackManifestResult =
  | { readonly ok: true; readonly value: ExperiencePackManifest }
  | { readonly ok: false; readonly issue: ExperiencePackValidationIssue };

export type ExperiencePackSerializationResult =
  | { readonly ok: true; readonly value: string; readonly manifest: ExperiencePackManifest }
  | { readonly ok: false; readonly issue: ExperiencePackValidationIssue };
