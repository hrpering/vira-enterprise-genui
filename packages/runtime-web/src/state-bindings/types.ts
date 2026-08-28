import type {
  RuntimeAction,
  RuntimeEffect,
  RuntimeError,
  RuntimeState,
} from "@vira-enterprise-genui/runtime-core";
import type { RuntimeWebUserActionValidationIssue } from "../events/index.js";

export type StateBindingSessionCreateCode =
  | "INVALID_INPUT"
  | "INVALID_INITIAL_STATE"
  | "INVALID_POLICY"
  | "INVALID_ACTION_ADAPTER";

export interface StateBindingSessionIssue {
  readonly code: StateBindingSessionCreateCode | "SESSION_DISPOSED" | "STATE_INVARIANT_VIOLATION";
  readonly path: string;
  readonly message: string;
}

export type StateBindingHostPatchValidationCode =
  | "INVALID_PATCH"
  | "ACTION_ID_FAILED"
  | "INVALID_RUNTIME_ACTION";

export interface StateBindingHostPatchValidationIssue {
  readonly code: StateBindingHostPatchValidationCode;
  readonly path: string;
  readonly message: string;
}

export interface BoundRuntimeAction {
  readonly action: RuntimeAction;
  readonly state: RuntimeState;
  readonly effects: readonly RuntimeEffect[];
  readonly stateChanged: boolean;
}

/** Compatibility alias for the original user-event-only state-binding surface. */
export type BoundUserEvent = BoundRuntimeAction;

export type StateBindingProcessResult =
  | { readonly ok: true; readonly value: BoundRuntimeAction }
  | { readonly ok: false; readonly stage: "session"; readonly issue: StateBindingSessionIssue }
  | { readonly ok: false; readonly stage: "event"; readonly issue: RuntimeWebUserActionValidationIssue }
  | { readonly ok: false; readonly stage: "runtime"; readonly error: RuntimeError };

export type StateBindingHostPatchResult =
  | { readonly ok: true; readonly value: BoundRuntimeAction }
  | { readonly ok: false; readonly stage: "session"; readonly issue: StateBindingSessionIssue }
  | { readonly ok: false; readonly stage: "host"; readonly issue: StateBindingHostPatchValidationIssue }
  | { readonly ok: false; readonly stage: "runtime"; readonly error: RuntimeError };

export interface StateBindingSession {
  currentState(): RuntimeState;
  process(event: unknown): StateBindingProcessResult;
  processHostPatch(patch: unknown): StateBindingHostPatchResult;
  dispose(): void;
}

export type CreateStateBindingSessionResult =
  | { readonly ok: true; readonly value: StateBindingSession }
  | { readonly ok: false; readonly issue: StateBindingSessionIssue };
