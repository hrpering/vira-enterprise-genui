import type { JsonObject } from "../json-value.js";

export const INTENT_PROTOCOL_VERSION = "1" as const;
export type IntentProtocolVersion = typeof INTENT_PROTOCOL_VERSION;

export interface Intent {
  readonly version: IntentProtocolVersion;
  readonly namespace: string;
  readonly name: string;
  readonly confidence?: number;
  readonly parameters?: JsonObject;
}

export type IntentValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_VERSION"
  | "INVALID_NAMESPACE"
  | "INVALID_NAME"
  | "INVALID_CONFIDENCE"
  | "INVALID_PARAMETERS";

export interface IntentValidationIssue {
  readonly code: IntentValidationCode;
  readonly path: string;
  readonly message: string;
}

export type IntentParseResult =
  | { readonly ok: true; readonly value: Intent }
  | { readonly ok: false; readonly issue: IntentValidationIssue };
