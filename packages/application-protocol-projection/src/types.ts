import type { ViraApplicationDistributionEnvelope, ViraApplicationDistributionValidationCode } from "@vira-enterprise-genui/application-distribution";
import type { JsonValue } from "@vira-enterprise-genui/protocol";

export const VIRA_APPLICATION_PROTOCOL_PROJECTION_SCHEMA_VERSION = "1" as const;
export const VIRA_APPLICATION_PROTOCOL_PROJECTION_MAX_LOSSES = 128 as const;
export const VIRA_APPLICATION_PROTOCOL_PROJECTION_PATH_MAX_LENGTH = 1_024 as const;
export const VIRA_APPLICATION_PROTOCOL_PROJECTION_REASON_MAX_LENGTH = 2_000 as const;

export type ViraApplicationProtocolProjectionRef =
  ViraApplicationDistributionEnvelope["application"]["protocolProjections"][number];

export type ViraApplicationProtocolProjectionFidelity = "lossless" | "lossy" | "unsupported";

export interface ViraApplicationProtocolProjectionLoss {
  readonly path: string;
  readonly reason: string;
}

export interface ViraApplicationProtocolProjectionLosslessResult {
  readonly fidelity: "lossless";
  readonly payload: JsonValue;
}

export interface ViraApplicationProtocolProjectionLossyResult {
  readonly fidelity: "lossy";
  readonly payload: JsonValue;
  readonly losses: readonly ViraApplicationProtocolProjectionLoss[];
}

export interface ViraApplicationProtocolProjectionUnsupportedResult {
  readonly fidelity: "unsupported";
  readonly reason: string;
}

export type ViraApplicationProtocolProjectionResult =
  | ViraApplicationProtocolProjectionLosslessResult
  | ViraApplicationProtocolProjectionLossyResult
  | ViraApplicationProtocolProjectionUnsupportedResult;

export interface ViraApplicationProtocolProjectionArtifact {
  readonly schemaVersion: typeof VIRA_APPLICATION_PROTOCOL_PROJECTION_SCHEMA_VERSION;
  readonly source: ViraApplicationDistributionEnvelope;
  readonly projectionRef: ViraApplicationProtocolProjectionRef;
  readonly result: ViraApplicationProtocolProjectionResult;
}

export type ViraApplicationProtocolProjectionValidationCode =
  | "INVALID_INPUT"
  | "UNKNOWN_FIELD"
  | "INVALID_SCHEMA_VERSION"
  | "INVALID_SOURCE"
  | "INVALID_PROJECTION_REF"
  | "UNDECLARED_PROJECTION"
  | "INVALID_RESULT"
  | "INVALID_FIDELITY"
  | "INVALID_PAYLOAD"
  | "INVALID_LOSSES"
  | "LOSS_LIMIT_EXCEEDED"
  | "DUPLICATE_LOSS"
  | "INVALID_LOSS_PATH"
  | "INVALID_REASON";

export interface ViraApplicationProtocolProjectionIssue {
  readonly code: ViraApplicationProtocolProjectionValidationCode;
  readonly path: string;
  readonly message: string;
  readonly distributionCode?: ViraApplicationDistributionValidationCode;
}

export type ViraApplicationProtocolProjectionParseResult =
  | { readonly ok: true; readonly value: ViraApplicationProtocolProjectionArtifact }
  | { readonly ok: false; readonly issue: ViraApplicationProtocolProjectionIssue };

export type ViraApplicationProtocolProjectionSerializationResult =
  | {
      readonly ok: true;
      readonly value: string;
      readonly artifact: ViraApplicationProtocolProjectionArtifact;
    }
  | { readonly ok: false; readonly issue: ViraApplicationProtocolProjectionIssue };
