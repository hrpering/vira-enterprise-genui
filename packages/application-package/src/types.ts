export const VIRA_APPLICATION_PACKAGE_SCHEMA_VERSION = "1" as const;
export const VIRA_APPLICATION_PACKAGE_MAX_EXPERIENCES = 128 as const;
export const VIRA_APPLICATION_PACKAGE_MAX_REFERENCES = 256 as const;
export const VIRA_APPLICATION_PACKAGE_MAX_ACTIONS = 256 as const;
export const VIRA_APPLICATION_PACKAGE_MAX_TAGS = 32 as const;
export const VIRA_APPLICATION_PACKAGE_MAX_NAME_LENGTH = 120 as const;
export const VIRA_APPLICATION_PACKAGE_MAX_DESCRIPTION_LENGTH = 2_000 as const;
export const VIRA_APPLICATION_PACKAGE_MAX_PUBLISHER_NAME_LENGTH = 120 as const;

export const VIRA_APPLICATION_VISIBILITIES = Object.freeze([
  "private",
  "organization",
  "public",
] as const);

export type ViraApplicationVisibility = (typeof VIRA_APPLICATION_VISIBILITIES)[number];

export interface ViraApplicationIdentity {
  readonly id: string;
}

export interface ViraApplicationPublisher {
  readonly id: string;
  readonly name: string;
}

export interface ViraApplicationExactReference {
  readonly id: string;
  readonly versionRef: string;
}

export interface ViraApplicationExperienceReference {
  readonly id: string;
  readonly packId: string;
  readonly packVersion: string;
  readonly entrypoint: string;
}

export interface ViraApplicationActionReference {
  readonly actionType: string;
}

export interface ViraApplicationHostCompatibility {
  readonly minViraVersion: string;
  readonly maxViraVersion?: string;
  readonly requiredCapabilities: readonly string[];
}

export interface ViraApplicationDistributionMetadata {
  readonly name: string;
  readonly description?: string;
  readonly tags: readonly string[];
  readonly visibility: ViraApplicationVisibility;
  readonly discoverable: boolean;
}

export interface ViraApplicationCommercialMetadata {
  readonly entitlementRefs: readonly ViraApplicationExactReference[];
  readonly meteringRefs: readonly ViraApplicationExactReference[];
}

export interface ViraApplicationPackage {
  readonly schemaVersion: typeof VIRA_APPLICATION_PACKAGE_SCHEMA_VERSION;
  readonly identity: ViraApplicationIdentity;
  readonly version: string;
  readonly publisher: ViraApplicationPublisher;
  readonly experiences: readonly ViraApplicationExperienceReference[];
  readonly capabilities: readonly ViraApplicationExactReference[];
  readonly contextTypes: readonly ViraApplicationExactReference[];
  readonly actions: readonly ViraApplicationActionReference[];
  readonly flows: readonly ViraApplicationExactReference[];
  readonly brandRef: ViraApplicationExactReference | null;
  readonly governanceRequirements: readonly ViraApplicationExactReference[];
  readonly hostCompatibility: ViraApplicationHostCompatibility;
  readonly protocolProjections: readonly ViraApplicationExactReference[];
  readonly distribution: ViraApplicationDistributionMetadata;
  readonly commercial: ViraApplicationCommercialMetadata;
}

export type ViraApplicationPackageValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_SCHEMA_VERSION"
  | "INVALID_IDENTITY"
  | "INVALID_VERSION"
  | "INVALID_PUBLISHER"
  | "INVALID_REFERENCE"
  | "FLOATING_REFERENCE"
  | "DUPLICATE_REFERENCE"
  | "REFERENCE_LIMIT_EXCEEDED"
  | "INVALID_EXPERIENCE"
  | "EXPERIENCE_LIMIT_EXCEEDED"
  | "DUPLICATE_EXPERIENCE"
  | "INVALID_ACTION"
  | "ACTION_LIMIT_EXCEEDED"
  | "DUPLICATE_ACTION"
  | "EMPTY_APPLICATION"
  | "INVALID_HOST_COMPATIBILITY"
  | "INVALID_DISTRIBUTION"
  | "INVALID_COMMERCIAL";

export interface ViraApplicationPackageValidationIssue {
  readonly code: ViraApplicationPackageValidationCode;
  readonly path: string;
  readonly message: string;
}

export type ViraApplicationPackageResult =
  | { readonly ok: true; readonly value: ViraApplicationPackage }
  | { readonly ok: false; readonly issue: ViraApplicationPackageValidationIssue };

export type ViraApplicationPackageSerializationResult =
  | { readonly ok: true; readonly value: string; readonly package: ViraApplicationPackage }
  | { readonly ok: false; readonly issue: ViraApplicationPackageValidationIssue };
