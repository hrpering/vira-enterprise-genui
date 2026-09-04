import type {
  ViraApplicationDistributionEnvelope,
  ViraApplicationDistributionValidationCode,
} from "@vira-enterprise-genui/application-distribution";
import type { ViraApplicationExactReference } from "@vira-enterprise-genui/application-package";

export const VIRA_APPLICATION_AI_HOST_SDK_VERSION = "1" as const;

export interface ViraApplicationAiHostDescriptor {
  readonly viraVersion: string;
  readonly capabilities: readonly string[];
  readonly protocolProjections: readonly ViraApplicationExactReference[];
}

export interface ViraApplicationAiHostCompatibilityPlan {
  readonly sdkVersion: typeof VIRA_APPLICATION_AI_HOST_SDK_VERSION;
  readonly source: ViraApplicationDistributionEnvelope;
  readonly host: ViraApplicationAiHostDescriptor;
  readonly compatibleProtocolProjections: readonly ViraApplicationExactReference[];
}

export type ViraApplicationAiHostIssueCode =
  | "INVALID_INPUT"
  | "UNKNOWN_FIELD"
  | "INVALID_HOST"
  | "INVALID_SOURCE"
  | "INVALID_INTEGRITY_VERIFIER"
  | "SOURCE_INTEGRITY_FAILED"
  | "HOST_VERSION_UNSUPPORTED"
  | "MISSING_HOST_CAPABILITY";

export interface ViraApplicationAiHostIssue {
  readonly code: ViraApplicationAiHostIssueCode;
  readonly path: string;
  readonly message: string;
  readonly distributionCode?: ViraApplicationDistributionValidationCode;
}

export type ViraApplicationAiHostResult =
  | { readonly ok: true; readonly value: ViraApplicationAiHostCompatibilityPlan }
  | { readonly ok: false; readonly issue: ViraApplicationAiHostIssue };
