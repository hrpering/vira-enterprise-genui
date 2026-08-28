import { deepFreezeData } from "../internal/deep-freeze.js";
import type { RuntimeState } from "../state/index.js";
import { RUNTIME_LIFECYCLES } from "./types.js";
import type {
  RuntimeLifecycle,
  RuntimeLifecycleTransitionCode,
  RuntimeLifecycleTransitionIssue,
} from "./types.js";

export type RuntimeLifecycleTransitionResult =
  | { readonly ok: true; readonly value: RuntimeState }
  | { readonly ok: false; readonly issue: RuntimeLifecycleTransitionIssue };

function failure(
  code: RuntimeLifecycleTransitionCode,
  path: string,
  message: string,
): RuntimeLifecycleTransitionResult {
  return { ok: false, issue: { code, path, message } };
}

export function isRuntimeLifecycle(value: unknown): value is RuntimeLifecycle {
  return typeof value === "string" && RUNTIME_LIFECYCLES.includes(value as RuntimeLifecycle);
}

export function canTransitionRuntimeLifecycle(from: RuntimeLifecycle, to: RuntimeLifecycle): boolean {
  switch (from) {
    case "created":
      return to === "mounting" || to === "cancelled" || to === "failed";
    case "mounting":
      return to === "active" || to === "cancelled" || to === "failed";
    case "active":
      return to === "updating" || to === "completed" || to === "cancelled" || to === "failed";
    case "updating":
      return to === "active" || to === "completed" || to === "cancelled" || to === "failed";
    case "completed":
    case "cancelled":
    case "failed":
      return to === "disposed";
    case "disposed":
      return false;
  }
}

export function transitionRuntimeLifecycle(
  state: RuntimeState,
  target: unknown,
): RuntimeLifecycleTransitionResult {
  if (!isRuntimeLifecycle(state.lifecycle)) {
    return failure("INVALID_RUNTIME_STATE", "$.lifecycle", "runtime state has an invalid lifecycle");
  }
  if (!Number.isSafeInteger(state.revision) || state.revision < 0) {
    return failure("INVALID_RUNTIME_STATE", "$.revision", "runtime revision must be a non-negative safe integer");
  }
  if (!isRuntimeLifecycle(target)) {
    return failure("INVALID_TARGET_LIFECYCLE", "$.target", "target must be a known runtime lifecycle");
  }
  if (!canTransitionRuntimeLifecycle(state.lifecycle, target)) {
    return failure(
      "ILLEGAL_LIFECYCLE_TRANSITION",
      "$.target",
      `cannot transition runtime lifecycle from ${state.lifecycle} to ${target}`,
    );
  }
  if (state.revision === Number.MAX_SAFE_INTEGER) {
    return failure("REVISION_OVERFLOW", "$.revision", "runtime revision cannot be incremented safely");
  }

  return {
    ok: true,
    value: Object.freeze({
      experienceId: state.experienceId,
      revision: state.revision + 1,
      lifecycle: target,
      plan: deepFreezeData(state.plan),
    }),
  };
}
