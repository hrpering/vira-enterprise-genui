import type { JsonObject, JsonValue } from "../json-value.js";

export const PATCH_PROTOCOL_VERSION = "1" as const;
export const PATCH_MAX_OPERATIONS = 256 as const;
export const PATCH_PATH_MAX_LENGTH = 1024 as const;

export type PatchProtocolVersion = typeof PATCH_PROTOCOL_VERSION;

export interface SetPatchOperation {
  readonly op: "set";
  readonly path: string;
  readonly value: JsonValue;
}

export interface RemovePatchOperation {
  readonly op: "remove";
  readonly path: string;
}

export interface MergePatchOperation {
  readonly op: "merge";
  readonly path: string;
  readonly value: JsonObject;
}

export interface AppendPatchOperation {
  readonly op: "append";
  readonly path: string;
  readonly value: JsonValue;
}

export interface ReplacePatchOperation {
  readonly op: "replace";
  readonly path: string;
  readonly value: JsonValue;
}

export type PatchOperation =
  | SetPatchOperation
  | RemovePatchOperation
  | MergePatchOperation
  | AppendPatchOperation
  | ReplacePatchOperation;

export interface Patch {
  readonly version: PatchProtocolVersion;
  readonly operations: readonly PatchOperation[];
}

export type PatchValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_VERSION"
  | "INVALID_OPERATIONS"
  | "OPERATION_LIMIT_EXCEEDED"
  | "INVALID_OPERATION"
  | "INVALID_PATH"
  | "INVALID_VALUE";

export interface PatchValidationIssue {
  readonly code: PatchValidationCode;
  readonly path: string;
  readonly message: string;
}

export type PatchParseResult =
  | { readonly ok: true; readonly value: Patch }
  | { readonly ok: false; readonly issue: PatchValidationIssue };
