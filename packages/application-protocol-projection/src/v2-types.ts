import type {
  ViraApplicationDistributionEnvelopeV2,
  ViraApplicationDistributionV2ValidationCode,
} from "@vira-enterprise-genui/application-distribution";
import type {
  ViraApplicationProtocolProjectionResult,
  ViraApplicationProtocolProjectionValidationCode,
} from "./types.js";

export const VIRA_APPLICATION_PROTOCOL_PROJECTION_V2_SCHEMA_VERSION = "2" as const;

export type ViraApplicationProtocolProjectionRefV2 =
  ViraApplicationDistributionEnvelopeV2["application"]["protocolProjections"][number];

export interface ViraApplicationProtocolProjectionArtifactV2 {
  readonly schemaVersion: typeof VIRA_APPLICATION_PROTOCOL_PROJECTION_V2_SCHEMA_VERSION;
  readonly source: ViraApplicationDistributionEnvelopeV2;
  readonly projectionRef: ViraApplicationProtocolProjectionRefV2;
  readonly result: ViraApplicationProtocolProjectionResult;
}

export interface ViraApplicationProtocolProjectionV2Issue {
  readonly code: ViraApplicationProtocolProjectionValidationCode;
  readonly path: string;
  readonly message: string;
  readonly distributionCode?: ViraApplicationDistributionV2ValidationCode;
}

export type ViraApplicationProtocolProjectionV2ParseResult =
  | { readonly ok: true; readonly value: ViraApplicationProtocolProjectionArtifactV2 }
  | { readonly ok: false; readonly issue: ViraApplicationProtocolProjectionV2Issue };

export type ViraApplicationProtocolProjectionV2SerializationResult =
  | {
      readonly ok: true;
      readonly value: string;
      readonly artifact: ViraApplicationProtocolProjectionArtifactV2;
    }
  | { readonly ok: false; readonly issue: ViraApplicationProtocolProjectionV2Issue };
