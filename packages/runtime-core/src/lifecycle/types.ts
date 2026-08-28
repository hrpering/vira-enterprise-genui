export const RUNTIME_LIFECYCLES = Object.freeze([
  "created",
  "mounting",
  "active",
  "updating",
  "completed",
  "cancelled",
  "failed",
  "disposed",
] as const);

export type RuntimeLifecycle = (typeof RUNTIME_LIFECYCLES)[number];

export type RuntimeLifecycleTransitionCode =
  | "INVALID_RUNTIME_STATE"
  | "INVALID_TARGET_LIFECYCLE"
  | "ILLEGAL_LIFECYCLE_TRANSITION"
  | "REVISION_OVERFLOW";

export interface RuntimeLifecycleTransitionIssue {
  readonly code: RuntimeLifecycleTransitionCode;
  readonly path: string;
  readonly message: string;
}
