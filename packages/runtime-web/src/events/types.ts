import type { RuntimeAction } from "@vira-enterprise-genui/runtime-core";

export interface RuntimeWebActionIdFactory {
  nextId(): string;
}

export type RuntimeWebUserActionValidationCode =
  | "INVALID_INPUT"
  | "INVALID_ACTION_EVENT"
  | "ACTION_ID_FAILED"
  | "INVALID_RUNTIME_ACTION";

export interface RuntimeWebUserActionValidationIssue {
  readonly code: RuntimeWebUserActionValidationCode;
  readonly path: string;
  readonly message: string;
}

export type CreateUserActionResult =
  | { readonly ok: true; readonly value: RuntimeAction }
  | { readonly ok: false; readonly issue: RuntimeWebUserActionValidationIssue };
