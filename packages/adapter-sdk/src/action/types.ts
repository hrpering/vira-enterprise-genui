import type { JsonObject } from "@vira-enterprise-genui/protocol";

export const ACTION_ADAPTER_CONTRACT_VERSION = "1" as const;
export const ACTION_ADAPTER_MAX_MAPPINGS = 256 as const;
export const ACTION_ADAPTER_EVENT_MAX_LENGTH = 128 as const;

export interface ActionAdapterMapping {
  readonly event: string;
  readonly actionType: string;
}

export interface ActionAdapterContract {
  readonly version: typeof ACTION_ADAPTER_CONTRACT_VERSION;
  readonly id: string;
  readonly mappings: readonly ActionAdapterMapping[];
}

export interface ActionDescriptor {
  readonly type: string;
  readonly payload: JsonObject;
}

export type ActionAdapterValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_VERSION"
  | "INVALID_ID"
  | "INVALID_MAPPINGS"
  | "MAPPING_LIMIT_EXCEEDED"
  | "INVALID_EVENT"
  | "INVALID_ACTION_TYPE"
  | "DUPLICATE_EVENT"
  | "INVALID_EVENT_INPUT"
  | "UNMAPPED_EVENT"
  | "INVALID_PAYLOAD";

export interface ActionAdapterValidationIssue {
  readonly code: ActionAdapterValidationCode;
  readonly path: string;
  readonly message: string;
}

export type ActionAdapterContractResult =
  | { readonly ok: true; readonly value: ActionAdapterContract }
  | { readonly ok: false; readonly issue: ActionAdapterValidationIssue };

export type AdaptActionEventResult =
  | { readonly ok: true; readonly value: ActionDescriptor }
  | { readonly ok: false; readonly issue: ActionAdapterValidationIssue };
