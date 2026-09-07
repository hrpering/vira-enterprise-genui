import type {
  ViraApplicationPackageV2,
  ViraApplicationPackageV2ValidationCode,
} from "@vira-enterprise-genui/application-package";
import type {
  ViraApplicationArtifactIntegrity,
  ViraApplicationDistributionIntegrityVerifier,
} from "./types.js";

export const VIRA_APPLICATION_DISTRIBUTION_V2_SCHEMA_VERSION = "2" as const;

export interface ViraApplicationDistributionEnvelopeV2 {
  readonly schemaVersion: typeof VIRA_APPLICATION_DISTRIBUTION_V2_SCHEMA_VERSION;
  readonly application: ViraApplicationPackageV2;
  readonly integrity: ViraApplicationArtifactIntegrity;
}

export type ViraApplicationDistributionV2ValidationCode =
  | "INVALID_INPUT"
  | "UNKNOWN_FIELD"
  | "INVALID_SCHEMA_VERSION"
  | "INVALID_APPLICATION"
  | "INVALID_INTEGRITY"
  | "INVALID_VERIFIER"
  | "INTEGRITY_VERIFICATION_FAILED"
  | "INTEGRITY_VERIFIER_FAILED";

export interface ViraApplicationDistributionV2Issue {
  readonly code: ViraApplicationDistributionV2ValidationCode;
  readonly path: string;
  readonly message: string;
  readonly applicationCode?: ViraApplicationPackageV2ValidationCode;
}

export type ViraApplicationDistributionV2Result =
  | { readonly ok: true; readonly value: ViraApplicationDistributionEnvelopeV2 }
  | { readonly ok: false; readonly issue: ViraApplicationDistributionV2Issue };

export type ViraApplicationDistributionV2SerializationResult =
  | {
      readonly ok: true;
      readonly value: string;
      readonly envelope: ViraApplicationDistributionEnvelopeV2;
    }
  | { readonly ok: false; readonly issue: ViraApplicationDistributionV2Issue };

export type ViraApplicationDistributionV2IntegrityVerifier = ViraApplicationDistributionIntegrityVerifier;
