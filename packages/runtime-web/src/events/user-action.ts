import {
  adaptActionEvent,
  createActionAdapterContract,
} from "@vira-enterprise-genui/adapter-sdk";
import { createRuntimeAction } from "@vira-enterprise-genui/runtime-core";
import { readRuntimeWebDataObject } from "../internal/data-object-input.js";
import type {
  CreateUserActionResult,
  RuntimeWebActionIdFactory,
  RuntimeWebUserActionValidationCode,
} from "./types.js";

const inputFields = new Set(["actionAdapter", "event"]);

function failure(code: RuntimeWebUserActionValidationCode, path: string, message: string): CreateUserActionResult {
  return { ok: false, issue: { code, path, message } };
}

function nestedPath(base: string, path: string): string {
  return path === "$" ? base : `${base}${path.slice(1)}`;
}

export function createUserActionFromEvent(input: unknown, idFactory: RuntimeWebActionIdFactory): CreateUserActionResult {
  const root = readRuntimeWebDataObject(input);
  if (!root.ok) return failure("INVALID_INPUT", root.issue.path, root.issue.reason);
  const fields = root.value;
  const unknownField = Object.keys(fields).sort().find((field) => !inputFields.has(field));
  if (unknownField) return failure("INVALID_INPUT", `$.${unknownField}`, `unknown user action input field: ${unknownField}`);

  const adapter = createActionAdapterContract(fields.actionAdapter);
  if (!adapter.ok) {
    return failure("INVALID_ACTION_EVENT", nestedPath("$.actionAdapter", adapter.issue.path), adapter.issue.message);
  }

  const descriptor = adaptActionEvent(adapter.value, fields.event);
  if (!descriptor.ok) {
    return failure("INVALID_ACTION_EVENT", nestedPath("$.event", descriptor.issue.path), descriptor.issue.message);
  }

  let actionId: string;
  try {
    actionId = idFactory.nextId();
  } catch {
    return failure("ACTION_ID_FAILED", "$.actionId", "trusted action ID factory failed");
  }

  const action = createRuntimeAction({
    id: actionId,
    type: descriptor.value.type,
    source: "user",
    payload: descriptor.value.payload,
  });
  if (!action.ok) return failure("INVALID_RUNTIME_ACTION", nestedPath("$.action", action.issue.path), action.issue.message);
  return { ok: true, value: action.value };
}
