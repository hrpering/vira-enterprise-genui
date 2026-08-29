import type { JsonValue } from "@vira-enterprise-genui/protocol";

export const EXTERNAL_TOOL_RESULT_VERSION = "1" as const;
export const EXTERNAL_TOOL_RESULT_OUTCOMES = Object.freeze([
  "success",
  "partial",
  "empty",
  "failure",
] as const);

export type ExternalToolResultOutcome = (typeof EXTERNAL_TOOL_RESULT_OUTCOMES)[number];

export interface ExternalToolIdentity {
  readonly kind: string;
  readonly name: string;
}

export interface ExternalToolFailure {
  readonly code: string;
}

export interface ExternalToolFreshness {
  readonly observedAtUnixMs: number;
  readonly expiresAtUnixMs?: number;
}

export interface ExternalToolResult {
  readonly version: typeof EXTERNAL_TOOL_RESULT_VERSION;
  readonly tool: ExternalToolIdentity;
  readonly outcome: ExternalToolResultOutcome;
  readonly data?: JsonValue;
  readonly failure?: ExternalToolFailure;
  readonly freshness?: ExternalToolFreshness;
}

export type ExternalToolResultValidationCode =
  | "INVALID_INPUT"
  | "UNKNOWN_FIELD"
  | "INVALID_VERSION"
  | "INVALID_TOOL"
  | "INVALID_OUTCOME"
  | "INVALID_DATA"
  | "INVALID_FAILURE"
  | "INVALID_FRESHNESS"
  | "OUTCOME_CONFLICT";

export interface ExternalToolResultValidationIssue {
  readonly code: ExternalToolResultValidationCode;
  readonly path: string;
  readonly message: string;
}

export type ExternalToolResultParseResult =
  | { readonly ok: true; readonly value: ExternalToolResult }
  | { readonly ok: false; readonly issue: ExternalToolResultValidationIssue };
