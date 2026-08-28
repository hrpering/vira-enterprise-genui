export const CAPABILITY_PROTOCOL_VERSION = "1" as const;
export type CapabilityProtocolVersion = typeof CAPABILITY_PROTOCOL_VERSION;

export interface Capability {
  readonly version: CapabilityProtocolVersion;
  readonly id: string;
}

export type CapabilityValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_VERSION"
  | "INVALID_ID";

export interface CapabilityValidationIssue {
  readonly code: CapabilityValidationCode;
  readonly path: string;
  readonly message: string;
}

export type CapabilityParseResult =
  | { readonly ok: true; readonly value: Capability }
  | { readonly ok: false; readonly issue: CapabilityValidationIssue };
