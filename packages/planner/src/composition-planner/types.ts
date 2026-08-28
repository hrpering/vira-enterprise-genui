import type { Capability } from "@vira-enterprise-genui/protocol";

export type CompositionPriorityMode = "resolve" | "interact" | "settled";

export interface CompositionDirective {
  readonly planId: string;
  readonly mode: CompositionPriorityMode;
  readonly primary: readonly Capability[];
  readonly supporting: readonly Capability[];
  readonly deferred: readonly Capability[];
}

export type CompositionPlannerValidationCode = "INVALID_PLAN";

export interface CompositionPlannerValidationIssue {
  readonly code: CompositionPlannerValidationCode;
  readonly path: string;
  readonly message: string;
}

export type CompositionPlannerResult =
  | { readonly ok: true; readonly value: CompositionDirective }
  | { readonly ok: false; readonly issue: CompositionPlannerValidationIssue };
