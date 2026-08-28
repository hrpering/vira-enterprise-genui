import type { ExperiencePlan } from "@vira-enterprise-genui/protocol";
import type { RuntimeLifecycle } from "../lifecycle/types.js";

export const RUNTIME_INITIAL_REVISION = 0 as const;
export const RUNTIME_INITIAL_LIFECYCLE = "created" as const satisfies RuntimeLifecycle;
export const RUNTIME_EXPERIENCE_ID_MAX_LENGTH = 128 as const;

export interface RuntimeState {
  readonly experienceId: string;
  readonly revision: number;
  readonly lifecycle: RuntimeLifecycle;
  readonly plan: ExperiencePlan;
}

export type RuntimeStateValidationCode = "INVALID_EXPERIENCE_ID" | "INVALID_PLAN";

export interface RuntimeStateValidationIssue {
  readonly code: RuntimeStateValidationCode;
  readonly path: string;
  readonly message: string;
}

export type RuntimeStateCreateResult =
  | { readonly ok: true; readonly value: RuntimeState }
  | { readonly ok: false; readonly issue: RuntimeStateValidationIssue };
