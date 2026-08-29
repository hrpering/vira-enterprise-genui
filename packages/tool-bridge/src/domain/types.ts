import type { DomainData } from "@vira-enterprise-genui/protocol";
import type {
  ExternalToolFailure,
  ExternalToolFreshness,
  ExternalToolIdentity,
} from "../types.js";

export const TOOL_DOMAIN_MAPPING_VERSION = "1" as const;

export interface ToolDomainMapping {
  readonly version: typeof TOOL_DOMAIN_MAPPING_VERSION;
  readonly tool: ExternalToolIdentity;
  readonly domain: string;
  readonly type: string;
}

export type ToolDomainMappingValidationCode =
  | "INVALID_INPUT"
  | "UNKNOWN_FIELD"
  | "INVALID_VERSION"
  | "INVALID_TOOL"
  | "INVALID_DOMAIN"
  | "INVALID_DATA_TYPE";

export interface ToolDomainMappingValidationIssue {
  readonly code: ToolDomainMappingValidationCode;
  readonly path: string;
  readonly message: string;
}

export type ToolDomainMappingResult =
  | { readonly ok: true; readonly value: ToolDomainMapping }
  | { readonly ok: false; readonly issue: ToolDomainMappingValidationIssue };

export interface ToolDomainTarget {
  readonly domain: string;
  readonly type: string;
}

export type NormalizedToolDomainResult =
  | { readonly outcome: "success"; readonly domainData: DomainData }
  | {
      readonly outcome: "partial";
      readonly domainData: DomainData;
      readonly failure?: ExternalToolFailure;
    }
  | {
      readonly outcome: "empty";
      readonly tool: ExternalToolIdentity;
      readonly target: ToolDomainTarget;
      readonly freshness?: ExternalToolFreshness;
    }
  | {
      readonly outcome: "failure";
      readonly tool: ExternalToolIdentity;
      readonly target: ToolDomainTarget;
      readonly failure: ExternalToolFailure;
      readonly freshness?: ExternalToolFreshness;
    };

export type ToolDomainNormalizationValidationCode =
  | "INVALID_TOOL_RESULT"
  | "INVALID_MAPPING"
  | "TOOL_MISMATCH"
  | "DOMAIN_DATA_REJECTED";

export interface ToolDomainNormalizationValidationIssue {
  readonly code: ToolDomainNormalizationValidationCode;
  readonly path: string;
  readonly message: string;
}

export type ToolDomainNormalizationResult =
  | { readonly ok: true; readonly value: NormalizedToolDomainResult }
  | { readonly ok: false; readonly issue: ToolDomainNormalizationValidationIssue };
