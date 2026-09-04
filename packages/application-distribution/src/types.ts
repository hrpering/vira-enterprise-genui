import type {
  ViraApplicationPackage,
  ViraApplicationPackageValidationCode,
} from "@vira-enterprise-genui/application-package";

export const VIRA_APPLICATION_DISTRIBUTION_SCHEMA_VERSION = "1" as const;
export const VIRA_APPLICATION_DISTRIBUTION_INTEGRITY_ALGORITHM = "sha256" as const;
export const VIRA_APPLICATION_DISTRIBUTION_SHA256_HEX_LENGTH = 64 as const;

export interface ViraApplicationArtifactIntegrity {
  readonly algorithm: typeof VIRA_APPLICATION_DISTRIBUTION_INTEGRITY_ALGORITHM;
  readonly digest: string;
}

export interface ViraApplicationDistributionEnvelope {
  readonly schemaVersion: typeof VIRA_APPLICATION_DISTRIBUTION_SCHEMA_VERSION;
  readonly application: ViraApplicationPackage;
  readonly integrity: ViraApplicationArtifactIntegrity;
}

export interface ViraApplicationDistributionVerifierInput {
  readonly algorithm: typeof VIRA_APPLICATION_DISTRIBUTION_INTEGRITY_ALGORITHM;
  readonly digest: string;
  readonly canonicalArtifact: string;
}

export type ViraApplicationDistributionIntegrityVerifier = (
  input: ViraApplicationDistributionVerifierInput,
) => boolean | Promise<boolean>;

export type ViraApplicationDistributionValidationCode =
  | "INVALID_INPUT"
  | "UNKNOWN_FIELD"
  | "INVALID_SCHEMA_VERSION"
  | "INVALID_APPLICATION"
  | "INVALID_INTEGRITY"
  | "INVALID_VERIFIER"
  | "INTEGRITY_VERIFICATION_FAILED"
  | "INTEGRITY_VERIFIER_FAILED";

export interface ViraApplicationDistributionIssue {
  readonly code: ViraApplicationDistributionValidationCode;
  readonly path: string;
  readonly message: string;
  readonly applicationCode?: ViraApplicationPackageValidationCode;
}

export type ViraApplicationDistributionResult =
  | { readonly ok: true; readonly value: ViraApplicationDistributionEnvelope }
  | { readonly ok: false; readonly issue: ViraApplicationDistributionIssue };

export type ViraApplicationDistributionSerializationResult =
  | {
      readonly ok: true;
      readonly value: string;
      readonly envelope: ViraApplicationDistributionEnvelope;
    }
  | { readonly ok: false; readonly issue: ViraApplicationDistributionIssue };
