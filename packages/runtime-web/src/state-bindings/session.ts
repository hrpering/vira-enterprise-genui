import { createActionAdapterContract } from "@vira-enterprise-genui/adapter-sdk";
import {
  createRuntimePermissionPolicy,
  parseRuntimeState,
} from "@vira-enterprise-genui/runtime-core";
import { reduceUserEvent } from "../events/index.js";
import type { RuntimeWebActionIdFactory } from "../events/index.js";
import { freezeRuntimeWebData } from "../internal/freeze.js";
import { readRuntimeWebDataObject } from "../internal/data-object-input.js";
import type {
  CreateStateBindingSessionResult,
  StateBindingProcessResult,
  StateBindingSessionIssue,
} from "./types.js";

const inputFields = new Set(["state", "policy", "actionAdapter"]);

function issue(
  code: StateBindingSessionIssue["code"],
  path: string,
  message: string,
): StateBindingSessionIssue {
  return Object.freeze({ code, path, message });
}

function nestedPath(base: string, path: string): string {
  return path === "$" ? base : `${base}${path.slice(1)}`;
}

function sameData(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (!sameData(left[index], right[index])) return false;
    }
    return true;
  }

  const leftObject = left as Record<string, unknown>;
  const rightObject = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftObject).sort();
  const rightKeys = Object.keys(rightObject).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  for (let index = 0; index < leftKeys.length; index += 1) {
    const key = leftKeys[index];
    if (!key || key !== rightKeys[index] || !sameData(leftObject[key], rightObject[key])) return false;
  }
  return true;
}

export function createStateBindingSession(
  input: unknown,
  idFactory: RuntimeWebActionIdFactory,
): CreateStateBindingSessionResult {
  const root = readRuntimeWebDataObject(input);
  if (!root.ok) {
    return { ok: false, issue: issue("INVALID_INPUT", root.issue.path, "state binding session input is invalid") };
  }
  const fields = root.value;
  const unknownField = Object.keys(fields).sort().find((field) => !inputFields.has(field));
  if (unknownField) {
    return {
      ok: false,
      issue: issue("INVALID_INPUT", `$.${unknownField}`, "state binding session input contains an unknown field"),
    };
  }

  const initialState = parseRuntimeState(fields.state);
  if (!initialState.ok) {
    return {
      ok: false,
      issue: issue("INVALID_INITIAL_STATE", nestedPath("$.state", initialState.issue.path), "initial runtime state is invalid"),
    };
  }

  const policy = createRuntimePermissionPolicy(fields.policy);
  if (!policy.ok) {
    return {
      ok: false,
      issue: issue("INVALID_POLICY", nestedPath("$.policy", policy.issue.path), "runtime permission policy is invalid"),
    };
  }

  const actionAdapter = createActionAdapterContract(fields.actionAdapter);
  if (!actionAdapter.ok) {
    return {
      ok: false,
      issue: issue("INVALID_ACTION_ADAPTER", nestedPath("$.actionAdapter", actionAdapter.issue.path), "action adapter contract is invalid"),
    };
  }

  let current = initialState.value;
  let disposed = false;

  const session = {
    currentState() {
      return current;
    },
    process(event: unknown): StateBindingProcessResult {
      if (disposed) {
        return {
          ok: false,
          stage: "session",
          issue: issue("SESSION_DISPOSED", "$", "state binding session is disposed"),
        };
      }

      const reduced = reduceUserEvent({
        state: current,
        policy: policy.value,
        actionAdapter: actionAdapter.value,
        event,
      }, idFactory);
      if (!reduced.ok) return reduced;

      const next = reduced.value.state;
      if (
        next.experienceId !== current.experienceId
        || next.revision < current.revision
        || next.revision > current.revision + 1
      ) {
        return {
          ok: false,
          stage: "session",
          issue: issue("STATE_INVARIANT_VIOLATION", "$.state", "Runtime Core returned an invalid state transition"),
        };
      }

      const stateChanged = next.revision === current.revision + 1;
      if (!stateChanged && !sameData(next, current)) {
        return {
          ok: false,
          stage: "session",
          issue: issue("STATE_INVARIANT_VIOLATION", "$.state", "Runtime Core returned semantic state drift without a revision change"),
        };
      }
      if (stateChanged) current = next;

      return {
        ok: true,
        value: freezeRuntimeWebData({
          action: reduced.value.action,
          state: current,
          effects: reduced.value.effects,
          stateChanged,
        }),
      };
    },
    dispose() {
      disposed = true;
    },
  };

  return { ok: true, value: Object.freeze(session) };
}
