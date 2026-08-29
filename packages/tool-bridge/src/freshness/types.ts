export const TOOL_FRESHNESS_STATUSES = Object.freeze([
  "unknown",
  "future",
  "fresh",
  "stale",
] as const);

export type ToolFreshnessStatus = (typeof TOOL_FRESHNESS_STATUSES)[number];

export interface ToolFreshnessEvaluation {
  readonly status: ToolFreshnessStatus;
  readonly nowUnixMs: number;
  readonly observedAtUnixMs?: number;
  readonly expiresAtUnixMs?: number;
}

export type ToolFreshnessEvaluationValidationCode =
  | "INVALID_NOW"
  | "INVALID_TOOL_RESULT";

export interface ToolFreshnessEvaluationValidationIssue {
  readonly code: ToolFreshnessEvaluationValidationCode;
  readonly path: string;
  readonly message: string;
}

export type ToolFreshnessEvaluationResult =
  | { readonly ok: true; readonly value: ToolFreshnessEvaluation }
  | { readonly ok: false; readonly issue: ToolFreshnessEvaluationValidationIssue };
