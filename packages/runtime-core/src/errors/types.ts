export const RUNTIME_ERROR_VERSION = "1" as const;
export const RUNTIME_ERROR_PATH_MAX_LENGTH = 1024 as const;

export const RUNTIME_ERROR_CODES = Object.freeze([
  "runtime.state.invalid",
  "runtime.action.invalid",
  "runtime.patch.invalid",
  "runtime.patch.rejected",
  "runtime.lifecycle.invalid-transition",
  "runtime.permission.denied",
  "runtime.permission.confirmation-required",
  "runtime.revision-overflow",
  "runtime.action.unhandled",
  "runtime.internal.invariant",
] as const);

export type RuntimeErrorCode = (typeof RUNTIME_ERROR_CODES)[number];
export type RuntimeErrorCategory = "validation" | "state" | "permission" | "conflict" | "internal";

export interface RuntimeError {
  readonly version: typeof RUNTIME_ERROR_VERSION;
  readonly code: RuntimeErrorCode;
  readonly category: RuntimeErrorCategory;
  readonly message: string;
  readonly path?: string;
}

export type RuntimeErrorCreateCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_CODE"
  | "INVALID_PATH";

export interface RuntimeErrorCreateIssue {
  readonly code: RuntimeErrorCreateCode;
  readonly path: string;
  readonly message: string;
}

export type RuntimeErrorCreateResult =
  | { readonly ok: true; readonly value: RuntimeError }
  | { readonly ok: false; readonly issue: RuntimeErrorCreateIssue };
