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

export interface BoundUserEvent {
  readonly action: RuntimeAction;
  readonly state: RuntimeState;
  readonly effects: readonly RuntimeEffect[];
  readonly stateChanged: boolean;
}

export type StateBindingProcessResult =
  | { readonly ok: true; readonly value: BoundUserEvent }
  | { readonly ok: false; readonly stage: "session"; readonly issue: StateBindingSessionIssue }
  | { readonly ok: false; readonly stage: "event"; readonly issue: RuntimeWebUserActionValidationIssue }
  | { readonly ok: false; readonly stage: "runtime"; readonly error: RuntimeError };

export interface StateBindingSession {
  currentState(): RuntimeState;
  process(event: unknown): StateBindingProcessResult;
  dispose(): void;
}

export type CreateStateBindingSessionResult =
  | { readonly ok: true; readonly value: StateBindingSession }
  | { readonly ok: false; readonly issue: StateBindingSessionIssue };
