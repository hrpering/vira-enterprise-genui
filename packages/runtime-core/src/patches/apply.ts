import {
  parseExperiencePlan,
  parsePatch,
} from "@vira-enterprise-genui/protocol";
import type {
  JsonObject,
  JsonValue,
  PatchOperation,
} from "@vira-enterprise-genui/protocol";
import { deepFreezeData } from "../internal/deep-freeze.js";
import type { RuntimeState } from "../state/index.js";
import type {
  RuntimePatchApplyCode,
  RuntimePatchApplyResult,
} from "./types.js";

type MutableJsonObject = { [key: string]: JsonValue };
type MutableJsonArray = JsonValue[];
type MutableContainer = MutableJsonObject | MutableJsonArray;

type LocalFailure = {
  readonly ok: false;
  readonly code: RuntimePatchApplyCode;
  readonly path: string;
  readonly message: string;
};

function failure(code: RuntimePatchApplyCode, path: string, message: string): RuntimePatchApplyResult {
  return { ok: false, issue: { code, path, message } };
}

function decodeValidatedPath(path: string): string[] {
  return path
    .slice(1)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function isMutableContainer(value: JsonValue): value is JsonObject | readonly JsonValue[] {
  return value !== null && typeof value === "object";
}

function arrayIndex(token: string, length: number): number | undefined {
  if (!/^(0|[1-9]\d*)$/.test(token)) return undefined;
  const index = Number(token);
  if (!Number.isSafeInteger(index) || index < 0 || index >= length) return undefined;
  return index;
}

function resolveParent(
  root: MutableJsonObject,
  tokens: readonly string[],
  operationPath: string,
):
  | { readonly ok: true; readonly parent: MutableContainer; readonly key: string }
  | LocalFailure {
  let current: JsonValue = root;

  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index];
    if (token === undefined) return { ok: false, code: "PATH_NOT_FOUND", path: operationPath, message: "patch path is incomplete" };

    if (Array.isArray(current)) {
      const childIndex = arrayIndex(token, current.length);
      if (childIndex === undefined) {
        return { ok: false, code: "INVALID_ARRAY_INDEX", path: operationPath, message: `invalid or out-of-bounds array index: ${token}` };
      }
      const child = current[childIndex];
      if (child === undefined) return { ok: false, code: "PATH_NOT_FOUND", path: operationPath, message: "patch path does not exist" };
      current = child;
      continue;
    }

    if (current !== null && typeof current === "object") {
      const object = current as MutableJsonObject;
      if (!Object.hasOwn(object, token)) {
        return { ok: false, code: "PATH_NOT_FOUND", path: operationPath, message: `patch path segment does not exist: ${token}` };
      }
      current = object[token] as JsonValue;
      continue;
    }

    return { ok: false, code: "INVALID_TARGET_TYPE", path: operationPath, message: "patch path traverses a non-container value" };
  }

  if (!isMutableContainer(current)) {
    return { ok: false, code: "INVALID_TARGET_TYPE", path: operationPath, message: "patch parent is not an object or array" };
  }
  const key = tokens[tokens.length - 1];
  if (key === undefined) return { ok: false, code: "PATH_NOT_FOUND", path: operationPath, message: "patch path is incomplete" };
  return { ok: true, parent: current as MutableContainer, key };
}

function resolveTarget(
  root: MutableJsonObject,
  tokens: readonly string[],
  operationPath: string,
):
  | { readonly ok: true; readonly value: JsonValue }
  | LocalFailure {
  let current: JsonValue = root;
  for (const token of tokens) {
    if (Array.isArray(current)) {
      const index = arrayIndex(token, current.length);
      if (index === undefined) {
        return { ok: false, code: "INVALID_ARRAY_INDEX", path: operationPath, message: `invalid or out-of-bounds array index: ${token}` };
      }
      const child = current[index];
      if (child === undefined) return { ok: false, code: "PATH_NOT_FOUND", path: operationPath, message: "patch target does not exist" };
      current = child;
      continue;
    }
    if (current !== null && typeof current === "object") {
      const object = current as MutableJsonObject;
      if (!Object.hasOwn(object, token)) {
        return { ok: false, code: "PATH_NOT_FOUND", path: operationPath, message: `patch target segment does not exist: ${token}` };
      }
      current = object[token] as JsonValue;
      continue;
    }
    return { ok: false, code: "INVALID_TARGET_TYPE", path: operationPath, message: "patch target traverses a non-container value" };
  }
  return { ok: true, value: current };
}

function setOrReplace(
  root: MutableJsonObject,
  tokens: readonly string[],
  value: JsonValue,
  replaceOnly: boolean,
  operationPath: string,
): LocalFailure | undefined {
  const resolved = resolveParent(root, tokens, operationPath);
  if (!resolved.ok) return resolved;
  const { parent, key } = resolved;

  if (Array.isArray(parent)) {
    const index = arrayIndex(key, parent.length);
    if (index === undefined) {
      return { ok: false, code: "INVALID_ARRAY_INDEX", path: operationPath, message: `invalid or out-of-bounds array index: ${key}; use append to grow arrays` };
    }
    parent[index] = value;
    return undefined;
  }

  if (replaceOnly && !Object.hasOwn(parent, key)) {
    return { ok: false, code: "PATH_NOT_FOUND", path: operationPath, message: `replace target does not exist: ${key}` };
  }
  parent[key] = value;
  return undefined;
}

function applyOperation(root: MutableJsonObject, operation: PatchOperation, index: number): LocalFailure | undefined {
  const operationPath = `$.operations[${index}].path`;
  const tokens = decodeValidatedPath(operation.path);

  if (operation.op === "set") return setOrReplace(root, tokens, operation.value, false, operationPath);
  if (operation.op === "replace") return setOrReplace(root, tokens, operation.value, true, operationPath);

  if (operation.op === "remove") {
    const resolved = resolveParent(root, tokens, operationPath);
    if (!resolved.ok) return resolved;
    const { parent, key } = resolved;
    if (Array.isArray(parent)) {
      const arrayIndexValue = arrayIndex(key, parent.length);
      if (arrayIndexValue === undefined) {
        return { ok: false, code: "INVALID_ARRAY_INDEX", path: operationPath, message: `invalid or out-of-bounds array index: ${key}` };
      }
      parent.splice(arrayIndexValue, 1);
      return undefined;
    }
    if (!Object.hasOwn(parent, key)) {
      return { ok: false, code: "PATH_NOT_FOUND", path: operationPath, message: `remove target does not exist: ${key}` };
    }
    delete parent[key];
    return undefined;
  }

  const target = resolveTarget(root, tokens, operationPath);
  if (!target.ok) return target;

  if (operation.op === "append") {
    if (!Array.isArray(target.value)) {
      return { ok: false, code: "INVALID_TARGET_TYPE", path: operationPath, message: "append target must be an array" };
    }
    (target.value as MutableJsonArray).push(operation.value);
    return undefined;
  }

  if (Array.isArray(target.value) || target.value === null || typeof target.value !== "object") {
    return { ok: false, code: "INVALID_TARGET_TYPE", path: operationPath, message: "merge target must be an object" };
  }
  const object = target.value as MutableJsonObject;
  for (const key of Object.keys(operation.value)) object[key] = operation.value[key] as JsonValue;
  return undefined;
}

export function applyRuntimePatch(state: RuntimeState, patchInput: unknown): RuntimePatchApplyResult {
  if (!Number.isSafeInteger(state.revision) || state.revision < 0) {
    return failure("INVALID_RUNTIME_STATE", "$.revision", "runtime revision must be a non-negative safe integer");
  }

  const currentPlan = parseExperiencePlan(state.plan);
  if (!currentPlan.ok) {
    const path = currentPlan.issue.path === "$" ? "$.plan" : `$.plan${currentPlan.issue.path.slice(1)}`;
    return failure("INVALID_RUNTIME_STATE", path, currentPlan.issue.message);
  }

  const patch = parsePatch(patchInput);
  if (!patch.ok) {
    const path = patch.issue.path === "$" ? "$.patch" : `$.patch${patch.issue.path.slice(1)}`;
    return failure("INVALID_PATCH", path, patch.issue.message);
  }

  if (patch.value.operations.length === 0) return { ok: true, value: state };
  if (state.revision === Number.MAX_SAFE_INTEGER) {
    return failure("REVISION_OVERFLOW", "$.revision", "runtime revision cannot be incremented safely");
  }

  const workingPlan = currentPlan.value as unknown as MutableJsonObject;
  for (let index = 0; index < patch.value.operations.length; index += 1) {
    const operation = patch.value.operations[index];
    if (!operation) continue;
    const issue = applyOperation(workingPlan, operation, index);
    if (issue) return failure(issue.code, issue.path, issue.message);
  }

  const finalPlan = parseExperiencePlan(workingPlan);
  if (!finalPlan.ok) {
    const path = finalPlan.issue.path === "$" ? "$.result" : `$.result${finalPlan.issue.path.slice(1)}`;
    return failure("RESULT_INVALID", path, finalPlan.issue.message);
  }

  const nextState: RuntimeState = {
    experienceId: state.experienceId,
    revision: state.revision + 1,
    plan: deepFreezeData(finalPlan.value),
  };
  return { ok: true, value: Object.freeze(nextState) };
}
