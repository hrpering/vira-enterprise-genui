import type {
  ViraApplicationDistributionEnvelope,
  ViraApplicationDistributionValidationCode,
} from "@vira-enterprise-genui/application-distribution";
import type { ViraApplicationPackageValidationCode } from "@vira-enterprise-genui/application-package";

export const VIRA_APPLICATION_PUBLISHER_SDK_VERSION = "1" as const;

export interface ViraApplicationPublisherDigestInput {
  readonly algorithm: "sha256";
  readonly canonicalArtifact: string;
  readonly applicationId: string;
  readonly applicationVersion: string;
  readonly publisherId: string;
}

export type ViraApplicationPublisherDigestProvider = (
  input: ViraApplicationPublisherDigestInput,
) => string | Promise<string>;

export interface ViraApplicationPublisherPreparedDistribution {
  readonly sdkVersion: typeof VIRA_APPLICATION_PUBLISHER_SDK_VERSION;
  readonly publisherId: string;
  readonly envelope: ViraApplicationDistributionEnvelope;
  readonly serializedEnvelope: string;
}

export type ViraApplicationPublisherIssueCode =
  | "INVALID_INPUT"
  | "UNKNOWN_FIELD"
  | "INVALID_PUBLISHER_ID"
  | "INVALID_APPLICATION"
  | "PUBLISHER_MISMATCH"
  | "INVALID_DIGEST_PROVIDER"
  | "DIGEST_PROVIDER_FAILED"
  | "INVALID_DIGEST"
  | "INVALID_DISTRIBUTION";

export interface ViraApplicationPublisherIssue {
  readonly code: ViraApplicationPublisherIssueCode;
  readonly path: string;
  readonly message: string;
  readonly applicationCode?: ViraApplicationPackageValidationCode;
  readonly distributionCode?: ViraApplicationDistributionValidationCode;
}

export type ViraApplicationPublisherPrepareResult =
  | { readonly ok: true; readonly value: ViraApplicationPublisherPreparedDistribution }
  | { readonly ok: false; readonly issue: ViraApplicationPublisherIssue };
