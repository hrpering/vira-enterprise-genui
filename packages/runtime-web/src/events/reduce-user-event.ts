import { reduceRuntime } from "@vira-enterprise-genui/runtime-core";
import { freezeRuntimeWebData } from "../internal/freeze.js";
import { readRuntimeWebDataObject } from "../internal/data-object-input.js";
import { createUserActionFromEvent } from "./user-action.js";
import type { ProcessUserEventResult, RuntimeWebActionIdFactory } from "./types.js";

const inputFields = new Set(["state", "policy", "actionAdapter", "event"]);

export function reduceUserEvent(input: unknown, idFactory: RuntimeWebActionIdFactory): ProcessUserEventResult {
  const root = readRuntimeWebDataObject(input);
  if (!root.ok) {
    return {
      ok: false,
      stage: "event",
      issue: { code: "INVALID_INPUT", path: root.issue.path, message: root.issue.reason },
    };
  }
  const fields = root.value;
  const unknownField = Object.keys(fields).sort().find((field) => !inputFields.has(field));
  if (unknownField) {
    return {
      ok: false,
      stage: "event",
      issue: { code: "INVALID_INPUT", path: `$.${unknownField}`, message: `unknown user event reducer field: ${unknownField}` },
    };
  }

  const action = createUserActionFromEvent(
    { actionAdapter: fields.actionAdapter, event: fields.event },
    idFactory,
  );
  if (!action.ok) return { ok: false, stage: "event", issue: action.issue };

  const reduction = reduceRuntime(fields.state, action.value, fields.policy);
  if (!reduction.ok) return { ok: false, stage: "runtime", error: reduction.error };

  return {
    ok: true,
    value: freezeRuntimeWebData({
      action: action.value,
      state: reduction.value.state,
      effects: reduction.value.effects,
    }),
  };
}
