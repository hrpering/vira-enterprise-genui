import { parseJsonValue } from "@vira-enterprise-genui/protocol";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import {
  RUNTIME_ERROR_CODES,
  RUNTIME_ERROR_PATH_MAX_LENGTH,
  RUNTIME_ERROR_VERSION,
} from "./types.js";
import type {
  RuntimeError,
  RuntimeErrorCategory,
  RuntimeErrorCode,
  RuntimeErrorCreateCode,
  RuntimeErrorCreateResult,
} from "./types.js";

const allowedFields = new Set(["code", "path"]);
const controlCharacterPattern = /[\u0000-\u001f\u007f]/;

function failure(code: RuntimeErrorCreateCode, path: string, message: string): RuntimeErrorCreateResult {
  return { ok: false, issue: { code, path, message } };
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isRuntimeErrorCode(value: unknown): value is RuntimeErrorCode {
  return typeof value === "string" && RUNTIME_ERROR_CODES.includes(value as RuntimeErrorCode);
}

export function runtimeErrorCategory(code: RuntimeErrorCode): RuntimeErrorCategory {
  if (code === "runtime.permission.denied" || code === "runtime.permission.confirmation-required") return "permission";
  if (code === "runtime.lifecycle.invalid-transition" || code === "runtime.patch.rejected" || code === "runtime.action.unhandled") return "conflict";
  if (code === "runtime.state.invalid" || code === "runtime.revision-overflow") return "state";
  if (code === "runtime.internal.invariant") return "internal";
  return "validation";
}

export function runtimeErrorMessage(code: RuntimeErrorCode): string {
  switch (code) {
    case "runtime.state.invalid": return "runtime state is invalid";
    case "runtime.action.invalid": return "runtime action is invalid";
    case "runtime.patch.invalid": return "runtime patch input is invalid";
    case "runtime.patch.rejected": return "runtime patch was rejected";
    case "runtime.lifecycle.invalid-transition": return "runtime lifecycle transition is not allowed";
    case "runtime.permission.denied": return "runtime permission denied";
    case "runtime.permission.confirmation-required": return "runtime confirmation is required";
    case "runtime.revision-overflow": return "runtime revision cannot be incremented safely";
    case "runtime.action.unhandled": return "runtime action is not handled by this reducer";
    case "runtime.internal.invariant": return "runtime internal invariant failed";
  }
}

export function createRuntimeError(input: unknown): RuntimeErrorCreateResult {
  const parsed = parseJsonValue(input);
  if (!parsed.ok) return failure("INVALID_TYPE", parsed.issue.path, parsed.issue.reason);
  if (!isJsonObject(parsed.value)) return failure("INVALID_TYPE", "$", "runtime error input must be a canonical JSON object");
  const fields = parsed.value;

  const unknownField = Object.keys(fields).sort().find((field) => !allowedFields.has(field));
  if (unknownField) return failure("UNKNOWN_FIELD", `$.${unknownField}`, `unknown runtime error field: ${unknownField}`);

  if (!isRuntimeErrorCode(fields.code)) {
    return failure("INVALID_CODE", "$.code", "runtime error code must be a known runtime-core error code");
  }

  let path: string | undefined;
  if (Object.hasOwn(fields, "path")) {
    if (
      typeof fields.path !== "string"
      || fields.path.length < 1
      || fields.path.length > RUNTIME_ERROR_PATH_MAX_LENGTH
      || controlCharacterPattern.test(fields.path)
    ) {
      return failure("INVALID_PATH", "$.path", `runtime error path must be printable and at most ${RUNTIME_ERROR_PATH_MAX_LENGTH} characters`);
    }
    path = fields.path;
  }

  const error: RuntimeError = {
    version: RUNTIME_ERROR_VERSION,
    code: fields.code,
    category: runtimeErrorCategory(fields.code),
    message: runtimeErrorMessage(fields.code),
    ...(path === undefined ? {} : { path }),
  };
  return { ok: true, value: Object.freeze(error) };
}
