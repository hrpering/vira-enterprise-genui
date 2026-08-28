import type { JsonValue } from "../json-value.js";

export const DOMAIN_DATA_PROTOCOL_VERSION = "1" as const;

export type DomainDataProtocolVersion = typeof DOMAIN_DATA_PROTOCOL_VERSION;

export interface DomainDataSource {
  readonly kind: string;
  readonly name?: string;
}

export interface DomainDataFreshness {
  readonly observedAtUnixMs: number;
  readonly expiresAtUnixMs?: number;
}

export interface DomainData {
  readonly version: DomainDataProtocolVersion;
  readonly domain: string;
  readonly type: string;
  readonly data: JsonValue;
  readonly source?: DomainDataSource;
  readonly freshness?: DomainDataFreshness;
}

export type DomainDataValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_VERSION"
  | "INVALID_DOMAIN"
  | "INVALID_DATA_TYPE"
  | "INVALID_DATA"
  | "INVALID_SOURCE"
  | "INVALID_FRESHNESS";

export interface DomainDataValidationIssue {
  readonly code: DomainDataValidationCode;
  readonly path: string;
  readonly message: string;
}

export type DomainDataParseResult =
  | { readonly ok: true; readonly value: DomainData }
  | { readonly ok: false; readonly issue: DomainDataValidationIssue };
