import { parseExperiencePlan, parseJsonValue } from "@vira-enterprise-genui/protocol";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import { deepFreezeData } from "../internal/deep-freeze.js";
import { isRuntimeLifecycle } from "../lifecycle/index.js";
import { isRuntimeExperienceId } from "./experience-id.js";
import type { RuntimeState, RuntimeStateParseCode, RuntimeStateParseResult } from "./types.js";

const stateFields = new Set(["experienceId", "revision", "lifecycle", "plan"]);

function failure(code: RuntimeStateParseCode, path: string, message: string): RuntimeStateParseResult {
  return { ok: false, issue: { code, path, message } };
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseRuntimeState(input: unknown): RuntimeStateParseResult {
  const parsed = parseJsonValue(input);
  if (!parsed.ok) return failure("INVALID_TYPE", parsed.issue.path, parsed.issue.reason);
  if (!isJsonObject(parsed.value)) return failure("INVALID_TYPE", "$", "runtime state must be a canonical JSON object");
  const fields = parsed.value;

  const unknownField = Object.keys(fields).sort().find((field) => !stateFields.has(field));
  if (unknownField) return failure("UNKNOWN_FIELD", `$.${unknownField}`, `unknown runtime state field: ${unknownField}`);
  if (!isRuntimeExperienceId(fields.experienceId)) {
    return failure("INVALID_EXPERIENCE_ID", "$.experienceId", "runtime experienceId is invalid");
  }
  if (typeof fields.revision !== "number" || !Number.isSafeInteger(fields.revision) || fields.revision < 0) {
    return failure("INVALID_REVISION", "$.revision", "runtime revision must be a non-negative safe integer");
  }
  if (!isRuntimeLifecycle(fields.lifecycle)) {
    return failure("INVALID_LIFECYCLE", "$.lifecycle", "runtime lifecycle is invalid");
  }

  const plan = parseExperiencePlan(fields.plan);
  if (!plan.ok) {
    const path = plan.issue.path === "$" ? "$.plan" : `$.plan${plan.issue.path.slice(1)}`;
    return failure("INVALID_PLAN", path, plan.issue.message);
  }

  const state: RuntimeState = {
    experienceId: fields.experienceId,
    revision: fields.revision,
    lifecycle: fields.lifecycle,
    plan: deepFreezeData(plan.value),
  };
  return { ok: true, value: Object.freeze(state) };
}
