import type { JsonObject } from "@vira-enterprise-genui/protocol";

export const DATA_ADAPTER_CONTRACT_VERSION = "1" as const;
export const DATA_ADAPTER_MAX_BINDINGS = 128 as const;

export interface DataAdapterBinding {
  readonly from: string;
  readonly to: string;
}

export interface DataAdapterContract {
  readonly version: typeof DATA_ADAPTER_CONTRACT_VERSION;
  readonly id: string;
  readonly domain: string;
  readonly type: string;
  readonly bindings: readonly DataAdapterBinding[];
}

export type DataAdapterValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_VERSION"
  | "INVALID_ID"
  | "INVALID_DOMAIN"
  | "INVALID_DATA_TYPE"
  | "INVALID_BINDINGS"
  | "BINDING_LIMIT_EXCEEDED"
  | "DUPLICATE_SOURCE_FIELD"
  | "DUPLICATE_TARGET_FIELD"
  | "INVALID_DOMAIN_DATA"
  | "DOMAIN_MISMATCH"
  | "DATA_TYPE_MISMATCH"
  | "NON_OBJECT_DATA"
  | "MISSING_SOURCE_FIELD";

export interface DataAdapterValidationIssue {
  readonly code: DataAdapterValidationCode;
  readonly path: string;
  readonly message: string;
}

export type DataAdapterContractResult =
  | { readonly ok: true; readonly value: DataAdapterContract }
  | { readonly ok: false; readonly issue: DataAdapterValidationIssue };

export type DataProjectionResult =
  | { readonly ok: true; readonly value: JsonObject }
  | { readonly ok: false; readonly issue: DataAdapterValidationIssue };
