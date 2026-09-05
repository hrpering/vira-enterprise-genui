import type {
  ViraApplicationDistributionEnvelopeV2,
  ViraApplicationDistributionV2ValidationCode,
} from "@vira-enterprise-genui/application-distribution";
import type {
  ViraApplicationPackageV2ValidationCode,
} from "@vira-enterprise-genui/application-package";

export const VIRA_APPLICATION_PUBLISHER_SDK_V2_VERSION = "2" as const;

export interface ViraApplicationPublisherDigestInputV2 {
  readonly algorithm: "sha256";
  readonly canonicalArtifact: string;
  readonly applicationId: string;
  readonly applicationVersion: string;
  readonly publisherId: string;
}

export type ViraApplicationPublisherDigestProviderV2 = (
  input: ViraApplicationPublisherDigestInputV2,
) => string | Promise<string>;

export interface ViraApplicationPublisherPreparedDistributionV2 {
  readonly sdkVersion: typeof VIRA_APPLICATION_PUBLISHER_SDK_V2_VERSION;
  readonly publisherId: string;
  readonly envelope: ViraApplicationDistributionEnvelopeV2;
  readonly serializedEnvelope: string;
}

export type ViraApplicationPublisherV2IssueCode =
  | "INVALID_INPUT"
  | "UNKNOWN_FIELD"
  | "INVALID_PUBLISHER_ID"
  | "INVALID_APPLICATION"
  | "PUBLISHER_MISMATCH"
  | "INVALID_DIGEST_PROVIDER"
  | "DIGEST_PROVIDER_FAILED"
  | "INVALID_DIGEST"
  | "INVALID_DISTRIBUTION";

export interface ViraApplicationPublisherV2Issue {
  readonly code: ViraApplicationPublisherV2IssueCode;
  readonly path: string;
  readonly message: string;
  readonly applicationCode?: ViraApplicationPackageV2ValidationCode;
  readonly distributionCode?: ViraApplicationDistributionV2ValidationCode;
}

export type ViraApplicationPublisherPrepareV2Result =
  | { readonly ok: true; readonly value: ViraApplicationPublisherPreparedDistributionV2 }
  | { readonly ok: false; readonly issue: ViraApplicationPublisherV2Issue };
