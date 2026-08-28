import type { Capability } from "../capability/index.js";
import type { Intent } from "../intent/index.js";
import type { JsonObject } from "../json-value.js";

export const EXPERIENCE_PLAN_PROTOCOL_VERSION = "1" as const;
export const EXPERIENCE_PLAN_ID_MAX_LENGTH = 128 as const;
export const EXPERIENCE_PLAN_MAX_CAPABILITIES = 256 as const;

export type ExperiencePlanProtocolVersion = typeof EXPERIENCE_PLAN_PROTOCOL_VERSION;

export interface PlannedCapabilities {
  readonly required: readonly Capability[];
  readonly available: readonly Capability[];
  readonly future: readonly Capability[];
}

export interface ExperiencePlan {
  readonly version: ExperiencePlanProtocolVersion;
  readonly id: string;
  readonly intent: Intent;
  readonly state: JsonObject;
  readonly capabilities: PlannedCapabilities;
}

export type ExperiencePlanValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_VERSION"
  | "INVALID_ID"
  | "INVALID_INTENT"
  | "INVALID_STATE"
  | "INVALID_CAPABILITIES"
  | "DUPLICATE_CAPABILITY"
  | "CAPABILITY_LIMIT_EXCEEDED";

export interface ExperiencePlanValidationIssue {
  readonly code: ExperiencePlanValidationCode;
  readonly path: string;
  readonly message: string;
}

export type ExperiencePlanParseResult =
  | { readonly ok: true; readonly value: ExperiencePlan }
  | { readonly ok: false; readonly issue: ExperiencePlanValidationIssue };
