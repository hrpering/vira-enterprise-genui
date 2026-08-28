import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";

export const STATE_RESOLVER_MAX_REQUIREMENTS = 128 as const;
export const STATE_RESOLVER_MAX_CANDIDATES = STATE_RESOLVER_MAX_REQUIREMENTS;

export interface StateResolutionConflict {
  readonly field: string;
  readonly current: JsonValue;
  readonly candidate: JsonValue;
}

export interface StateResolution {
  readonly state: JsonObject;
  readonly known: readonly string[];
  readonly missing: readonly string[];
  readonly conflicts: readonly StateResolutionConflict[];
}

export type StateResolverValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_STATE"
  | "INVALID_REQUIRED"
  | "REQUIREMENT_LIMIT_EXCEEDED"
  | "DUPLICATE_REQUIREMENT"
  | "INVALID_CANDIDATES"
  | "CANDIDATE_LIMIT_EXCEEDED"
  | "UNREQUESTED_CANDIDATE";

export interface StateResolverValidationIssue {
  readonly code: StateResolverValidationCode;
  readonly path: string;
  readonly message: string;
}

export type StateResolverResult =
  | { readonly ok: true; readonly value: StateResolution }
  | { readonly ok: false; readonly issue: StateResolverValidationIssue };
