import type { JsonObject } from "@vira-enterprise-genui/protocol";

export const RUNTIME_ACTION_ID_MAX_LENGTH = 128 as const;
export const RUNTIME_ACTION_SOURCES = Object.freeze(["user", "host", "system"] as const);

export type RuntimeActionSource = (typeof RUNTIME_ACTION_SOURCES)[number];

export interface RuntimeAction {
  readonly id: string;
  readonly type: string;
  readonly source: RuntimeActionSource;
  readonly payload: JsonObject;
}

export type RuntimeActionValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_ID"
  | "INVALID_ACTION_TYPE"
  | "INVALID_SOURCE"
  | "INVALID_PAYLOAD";

export interface RuntimeActionValidationIssue {
  readonly code: RuntimeActionValidationCode;
  readonly path: string;
  readonly message: string;
}

export type RuntimeActionCreateResult =
  | { readonly ok: true; readonly value: RuntimeAction }
  | { readonly ok: false; readonly issue: RuntimeActionValidationIssue };
