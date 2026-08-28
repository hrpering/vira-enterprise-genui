import { parsePatch } from "@vira-enterprise-genui/protocol";
import { createRuntimeAction } from "../actions/index.js";
import type { RuntimeAction } from "../actions/index.js";
import {
  RUNTIME_ERROR_VERSION,
  runtimeErrorCategory,
  runtimeErrorMessage,
} from "../errors/index.js";
import type { RuntimeError, RuntimeErrorCode } from "../errors/index.js";
import {
  canTransitionRuntimeLifecycle,
  isRuntimeLifecycle,
  transitionRuntimeLifecycle,
} from "../lifecycle/index.js";
import { applyRuntimePatch } from "../patches/index.js";
import {
  createRuntimePermissionPolicy,
  evaluateRuntimeActionPermission,
} from "../permissions/index.js";
import { parseRuntimeState } from "../state/index.js";
import type { RuntimeState } from "../state/index.js";
import type { RuntimeEffect, RuntimeReduceResult } from "./types.js";

const emptyEffects = Object.freeze([] as RuntimeEffect[]);
const terminalLifecycles = new Set(["completed", "cancelled", "failed", "disposed"]);

function runtimeError(code: RuntimeErrorCode, path?: string): RuntimeError {
  return Object.freeze({
    version: RUNTIME_ERROR_VERSION,
    code,
    category: runtimeErrorCategory(code),
    message: runtimeErrorMessage(code),
    ...(path === undefined ? {} : { path }),
  });
}

function failure(code: RuntimeErrorCode, path?: string): RuntimeReduceResult {
  return Object.freeze({ ok: false, error: runtimeError(code, path) });
}

function success(state: RuntimeState, effects: readonly RuntimeEffect[] = emptyEffects): RuntimeReduceResult {
  return Object.freeze({ ok: true, value: Object.freeze({ state, effects }) });
}

function nestedPath(base: string, path: string): string {
  return path === "$" ? base : `${base}${path.slice(1)}`;
}

function singlePayloadField(action: RuntimeAction, field: string): unknown | undefined {
  const keys = Object.keys(action.payload);
  if (keys.length !== 1 || keys[0] !== field) return undefined;
  return action.payload[field];
}

function confirmationEffect(action: RuntimeAction): RuntimeEffect {
  return Object.freeze({ type: "confirmation-required", action });
}

function hostEffect(action: RuntimeAction): RuntimeEffect {
  return Object.freeze({ type: "host-action", action });
}

function preflight(state: RuntimeState, action: RuntimeAction): RuntimeError | undefined {
  if (action.type === "runtime.patch.apply") {
    const patchInput = singlePayloadField(action, "patch");
    if (patchInput === undefined) return runtimeError("runtime.action.invalid", "$.action.payload");
    if (terminalLifecycles.has(state.lifecycle)) return runtimeError("runtime.patch.rejected", "$.lifecycle");
    if (state.revision === Number.MAX_SAFE_INTEGER) return runtimeError("runtime.revision-overflow", "$.revision");
    if (!parsePatch(patchInput).ok) return runtimeError("runtime.patch.invalid", "$.action.payload.patch");
    return undefined;
  }

  if (action.type === "runtime.lifecycle.transition") {
    const target = singlePayloadField(action, "target");
    if (target === undefined) return runtimeError("runtime.action.invalid", "$.action.payload");
    if (!isRuntimeLifecycle(target) || !canTransitionRuntimeLifecycle(state.lifecycle, target)) {
      return runtimeError("runtime.lifecycle.invalid-transition", "$.action.payload.target");
    }
    if (state.revision === Number.MAX_SAFE_INTEGER) return runtimeError("runtime.revision-overflow", "$.revision");
    return undefined;
  }

  if (terminalLifecycles.has(state.lifecycle)) return runtimeError("runtime.action.unhandled", "$.lifecycle");
  return undefined;
}

function reducePatch(state: RuntimeState, action: RuntimeAction): RuntimeReduceResult {
  const patchInput = singlePayloadField(action, "patch");
  if (patchInput === undefined) return failure("runtime.action.invalid", "$.action.payload");
  const applied = applyRuntimePatch(state, patchInput);
  if (applied.ok) return success(applied.value);

  switch (applied.issue.code) {
    case "INVALID_PATCH": return failure("runtime.patch.invalid", "$.action.payload.patch");
    case "INVALID_RUNTIME_STATE": return failure("runtime.state.invalid", applied.issue.path);
    case "REVISION_OVERFLOW": return failure("runtime.revision-overflow", "$.revision");
    default: return failure("runtime.patch.rejected", "$.action.payload.patch");
  }
}

function reduceLifecycle(state: RuntimeState, action: RuntimeAction): RuntimeReduceResult {
  const target = singlePayloadField(action, "target");
  if (target === undefined) return failure("runtime.action.invalid", "$.action.payload");
  const transitioned = transitionRuntimeLifecycle(state, target);
  if (transitioned.ok) return success(transitioned.value);
  if (transitioned.issue.code === "REVISION_OVERFLOW") return failure("runtime.revision-overflow", "$.revision");
  if (transitioned.issue.code === "INVALID_RUNTIME_STATE") return failure("runtime.state.invalid", transitioned.issue.path);
  return failure("runtime.lifecycle.invalid-transition", "$.action.payload.target");
}

export function reduceRuntime(
  stateInput: unknown,
  actionInput: unknown,
  policyInput: unknown,
): RuntimeReduceResult {
  const state = parseRuntimeState(stateInput);
  if (!state.ok) return failure("runtime.state.invalid", nestedPath("$.state", state.issue.path));

  const action = createRuntimeAction(actionInput);
  if (!action.ok) return failure("runtime.action.invalid", nestedPath("$.action", action.issue.path));

  const policy = createRuntimePermissionPolicy(policyInput);
  if (!policy.ok) return failure("runtime.permission.denied", "$.policy");

  const permission = evaluateRuntimeActionPermission(policy.value, action.value);
  if (!permission.ok) return failure("runtime.action.invalid", nestedPath("$.action", permission.issue.path));
  if (permission.value.effect === "deny") return failure("runtime.permission.denied", "$.action.type");

  const preflightError = preflight(state.value, action.value);
  if (preflightError) return Object.freeze({ ok: false, error: preflightError });

  if (permission.value.effect === "confirm") {
    return success(state.value, Object.freeze([confirmationEffect(action.value)]));
  }
  if (action.value.type === "runtime.patch.apply") return reducePatch(state.value, action.value);
  if (action.value.type === "runtime.lifecycle.transition") return reduceLifecycle(state.value, action.value);
  return success(state.value, Object.freeze([hostEffect(action.value)]));
}
