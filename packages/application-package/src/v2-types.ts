import type {
  ViraApplicationDistributionMetadata,
  ViraApplicationExactReference,
  ViraApplicationExperienceReference,
  ViraApplicationHostCompatibility,
  ViraApplicationIdentity,
  ViraApplicationPackageValidationCode,
  ViraApplicationPublisher,
} from "./types.js";

export const VIRA_APPLICATION_PACKAGE_V2_SCHEMA_VERSION = "2" as const;
export const VIRA_APPLICATION_TRIGGER_TYPES = Object.freeze([
  "api",
  "webhook",
  "schedule",
  "application-call",
] as const);

export type ViraApplicationTriggerType = (typeof VIRA_APPLICATION_TRIGGER_TYPES)[number];

export interface ViraApplicationTriggerDeclaration {
  readonly type: ViraApplicationTriggerType;
  readonly entrypointRef: ViraApplicationExactReference;
}

export interface ViraApplicationCommercialMetadataV2 {
  readonly entitlementRefs: readonly ViraApplicationExactReference[];
  readonly meteringRefs: readonly ViraApplicationExactReference[];
  readonly pricingRefs: readonly ViraApplicationExactReference[];
  readonly settlementRefs: readonly ViraApplicationExactReference[];
}

export interface ViraApplicationPackageV2 {
  readonly schemaVersion: typeof VIRA_APPLICATION_PACKAGE_V2_SCHEMA_VERSION;
  readonly identity: ViraApplicationIdentity;
  readonly version: string;
  readonly publisher: ViraApplicationPublisher;
  readonly experiences: readonly ViraApplicationExperienceReference[];
  readonly capabilities: readonly ViraApplicationExactReference[];
  readonly contextTypes: readonly ViraApplicationExactReference[];
  readonly actions: readonly ViraApplicationExactReference[];
  readonly flows: readonly ViraApplicationExactReference[];
  readonly brandRef: ViraApplicationExactReference | null;
  readonly governanceRequirements: readonly ViraApplicationExactReference[];
  readonly hostCompatibility: ViraApplicationHostCompatibility;
  readonly protocolProjections: readonly ViraApplicationExactReference[];
  readonly triggers: readonly ViraApplicationTriggerDeclaration[];
  readonly distribution: ViraApplicationDistributionMetadata;
  readonly commercial: ViraApplicationCommercialMetadataV2;
}

export type ViraApplicationPackageV2ValidationCode =
  | ViraApplicationPackageValidationCode
  | "INVALID_TRIGGER"
  | "DUPLICATE_TRIGGER"
  | "TRIGGER_ENTRYPOINT_NOT_FOUND";

export interface ViraApplicationPackageV2ValidationIssue {
  readonly code: ViraApplicationPackageV2ValidationCode;
  readonly path: string;
  readonly message: string;
}

export type ViraApplicationPackageV2Result =
  | { readonly ok: true; readonly value: ViraApplicationPackageV2 }
  | { readonly ok: false; readonly issue: ViraApplicationPackageV2ValidationIssue };

export type ViraApplicationPackageV2SerializationResult =
  | { readonly ok: true; readonly value: string; readonly package: ViraApplicationPackageV2 }
  | { readonly ok: false; readonly issue: ViraApplicationPackageV2ValidationIssue };
