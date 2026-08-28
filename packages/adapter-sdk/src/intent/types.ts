import type { Intent } from "@vira-enterprise-genui/protocol";

export const INTENT_ADAPTER_CONTRACT_VERSION = "1" as const;
export const INTENT_ADAPTER_MAX_MAPPINGS = 128 as const;
export const INTENT_ADAPTER_SOURCE_MAX_LENGTH = 128 as const;

export interface IntentAdapterMapping {
  readonly source: string;
  readonly target: {
    readonly namespace: string;
    readonly name: string;
  };
}

export interface IntentAdapterContract {
  readonly version: typeof INTENT_ADAPTER_CONTRACT_VERSION;
  readonly id: string;
  readonly mappings: readonly IntentAdapterMapping[];
}

export type IntentAdapterValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_VERSION"
  | "INVALID_ID"
  | "INVALID_MAPPINGS"
  | "MAPPING_LIMIT_EXCEEDED"
  | "INVALID_SOURCE"
  | "INVALID_TARGET"
  | "DUPLICATE_SOURCE"
  | "UNMAPPED_SOURCE"
  | "INVALID_INTENT_INPUT"
  | "INVALID_INTENT";

export interface IntentAdapterValidationIssue {
  readonly code: IntentAdapterValidationCode;
  readonly path: string;
  readonly message: string;
}

export type IntentAdapterContractResult =
  | { readonly ok: true; readonly value: IntentAdapterContract }
  | { readonly ok: false; readonly issue: IntentAdapterValidationIssue };

export type AdaptIntentAliasResult =
  | { readonly ok: true; readonly value: Intent }
  | { readonly ok: false; readonly issue: IntentAdapterValidationIssue };
