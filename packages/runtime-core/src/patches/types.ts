import type { RuntimeState } from "../state/index.js";

export type RuntimePatchApplyCode =
  | "INVALID_PATCH"
  | "INVALID_RUNTIME_STATE"
  | "PATH_NOT_FOUND"
  | "INVALID_TARGET_TYPE"
  | "INVALID_ARRAY_INDEX"
  | "RESULT_INVALID"
  | "REVISION_OVERFLOW";

export interface RuntimePatchApplyIssue {
  readonly code: RuntimePatchApplyCode;
  readonly path: string;
  readonly message: string;
}

export type RuntimePatchApplyResult =
  | { readonly ok: true; readonly value: RuntimeState }
  | { readonly ok: false; readonly issue: RuntimePatchApplyIssue };
