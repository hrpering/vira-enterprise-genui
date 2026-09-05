import type {
  ViraApplicationDistributionEnvelopeV2,
  ViraApplicationDistributionV2ValidationCode,
} from "@vira-enterprise-genui/application-distribution";
import type { ViraApplicationExactReference } from "@vira-enterprise-genui/application-package";
import type {
  ViraApplicationAiHostDescriptor,
  ViraApplicationAiHostIssueCode,
} from "./types.js";

export const VIRA_APPLICATION_AI_HOST_SDK_V2_VERSION = "2" as const;

export interface ViraApplicationAiHostCompatibilityPlanV2 {
  readonly sdkVersion: typeof VIRA_APPLICATION_AI_HOST_SDK_V2_VERSION;
  readonly source: ViraApplicationDistributionEnvelopeV2;
  readonly host: ViraApplicationAiHostDescriptor;
  readonly compatibleProtocolProjections: readonly ViraApplicationExactReference[];
}

export interface ViraApplicationAiHostV2Issue {
  readonly code: ViraApplicationAiHostIssueCode;
  readonly path: string;
  readonly message: string;
  readonly distributionCode?: ViraApplicationDistributionV2ValidationCode;
}

export type ViraApplicationAiHostV2Result =
  | { readonly ok: true; readonly value: ViraApplicationAiHostCompatibilityPlanV2 }
  | { readonly ok: false; readonly issue: ViraApplicationAiHostV2Issue };
