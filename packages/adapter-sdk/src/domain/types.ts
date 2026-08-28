import type { DomainData } from "@vira-enterprise-genui/protocol";

export const DOMAIN_ADAPTER_CONTRACT_VERSION = "1" as const;
export const DOMAIN_ADAPTER_MAX_TYPES = 64 as const;

export interface DomainAdapterContract {
  readonly version: typeof DOMAIN_ADAPTER_CONTRACT_VERSION;
  readonly id: string;
  readonly domain: string;
  readonly types: readonly string[];
}

export type DomainAdapterValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_VERSION"
  | "INVALID_ID"
  | "INVALID_DOMAIN"
  | "INVALID_TYPES"
  | "TYPE_LIMIT_EXCEEDED"
  | "DUPLICATE_TYPE"
  | "INVALID_DOMAIN_DATA"
  | "DOMAIN_MISMATCH"
  | "UNSUPPORTED_DATA_TYPE";

export interface DomainAdapterValidationIssue {
  readonly code: DomainAdapterValidationCode;
  readonly path: string;
  readonly message: string;
}

export type DomainAdapterContractResult =
  | { readonly ok: true; readonly value: DomainAdapterContract }
  | { readonly ok: false; readonly issue: DomainAdapterValidationIssue };

export type DomainDataForAdapterResult =
  | { readonly ok: true; readonly value: DomainData }
  | { readonly ok: false; readonly issue: DomainAdapterValidationIssue };
