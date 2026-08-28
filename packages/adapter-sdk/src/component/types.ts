import { EXPERIENCE_PLAN_MAX_CAPABILITIES } from "@vira-enterprise-genui/protocol";
import type { Capability } from "@vira-enterprise-genui/protocol";

export const COMPONENT_ADAPTER_CONTRACT_VERSION = "1" as const;
export const COMPONENT_ADAPTER_MAX_MAPPINGS = EXPERIENCE_PLAN_MAX_CAPABILITIES;

export interface ComponentAdapterMapping {
  readonly capability: Capability;
  readonly component: string;
}

export interface ComponentAdapterContract {
  readonly version: typeof COMPONENT_ADAPTER_CONTRACT_VERSION;
  readonly id: string;
  readonly mappings: readonly ComponentAdapterMapping[];
}

export type ComponentAdapterValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_VERSION"
  | "INVALID_ID"
  | "INVALID_MAPPINGS"
  | "MAPPING_LIMIT_EXCEEDED"
  | "INVALID_CAPABILITY"
  | "INVALID_COMPONENT_REFERENCE"
  | "DUPLICATE_CAPABILITY"
  | "UNMAPPED_CAPABILITY";

export interface ComponentAdapterValidationIssue {
  readonly code: ComponentAdapterValidationCode;
  readonly path: string;
  readonly message: string;
}

export type ComponentAdapterContractResult =
  | { readonly ok: true; readonly value: ComponentAdapterContract }
  | { readonly ok: false; readonly issue: ComponentAdapterValidationIssue };

export type ResolveComponentResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly issue: ComponentAdapterValidationIssue };
