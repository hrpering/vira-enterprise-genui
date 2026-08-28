import type { RuntimeAction } from "../actions/index.js";
import type { RuntimeError } from "../errors/index.js";
import type { RuntimeState } from "../state/index.js";

export interface RuntimeHostActionEffect {
  readonly type: "host-action";
  readonly action: RuntimeAction;
}

export interface RuntimeConfirmationRequiredEffect {
  readonly type: "confirmation-required";
  readonly action: RuntimeAction;
}

export type RuntimeEffect = RuntimeHostActionEffect | RuntimeConfirmationRequiredEffect;

export interface RuntimeReduction {
  readonly state: RuntimeState;
  readonly effects: readonly RuntimeEffect[];
}

export type RuntimeReduceResult =
  | { readonly ok: true; readonly value: RuntimeReduction }
  | { readonly ok: false; readonly error: RuntimeError };
