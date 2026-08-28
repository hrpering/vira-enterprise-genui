import type { Capability } from "@vira-enterprise-genui/protocol";

export const SEMANTIC_REGION_ROLES = Object.freeze(["primary", "supporting", "deferred"] as const);
export const SEMANTIC_REGION_MAX_REGIONS = 16 as const;

export type SemanticRegionRole = (typeof SEMANTIC_REGION_ROLES)[number];

export interface SemanticRegion {
  readonly id: string;
  readonly role: SemanticRegionRole;
  readonly capabilities: readonly Capability[];
}

export interface SemanticRegionSet {
  readonly regions: readonly SemanticRegion[];
}

export type SemanticRegionValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "REGION_LIMIT_EXCEEDED"
  | "INVALID_REGION"
  | "INVALID_REGION_ID"
  | "INVALID_REGION_ROLE"
  | "INVALID_CAPABILITIES"
  | "CAPABILITY_LIMIT_EXCEEDED"
  | "DUPLICATE_REGION_ID"
  | "DUPLICATE_CAPABILITY";

export interface SemanticRegionValidationIssue {
  readonly code: SemanticRegionValidationCode;
  readonly path: string;
  readonly message: string;
}

export type SemanticRegionSetResult =
  | { readonly ok: true; readonly value: SemanticRegionSet }
  | { readonly ok: false; readonly issue: SemanticRegionValidationIssue };
