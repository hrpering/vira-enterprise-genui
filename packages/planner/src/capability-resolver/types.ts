import type { Capability, PlannedCapabilities } from "@vira-enterprise-genui/protocol";

export const CAPABILITY_RESOLVER_MAX_ENTRIES = 256 as const;

export interface CapabilityRequirement {
  readonly field: string;
  readonly capability: Capability;
}

export type CapabilityResolution = PlannedCapabilities;

export type CapabilityResolverValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "ENTRY_LIMIT_EXCEEDED"
  | "OUTPUT_LIMIT_EXCEEDED"
  | "INVALID_BLOCKERS"
  | "AMBIGUOUS_BLOCKER"
  | "INVALID_REQUIREMENT"
  | "DUPLICATE_REQUIREMENT"
  | "UNMAPPED_BLOCKER"
  | "INVALID_CAPABILITY"
  | "DUPLICATE_CAPABILITY";

export interface CapabilityResolverValidationIssue {
  readonly code: CapabilityResolverValidationCode;
  readonly path: string;
  readonly message: string;
}

export type CapabilityResolverResult =
  | { readonly ok: true; readonly value: CapabilityResolution }
  | { readonly ok: false; readonly issue: CapabilityResolverValidationIssue };
