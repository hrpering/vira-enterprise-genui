import {
  isSemanticNamespace,
  parseJsonValue,
} from "@vira-enterprise-genui/protocol";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import { deepFreezeData } from "../internal/deep-freeze.js";
import {
  RUNTIME_ACTION_ID_MAX_LENGTH,
  RUNTIME_ACTION_SOURCES,
} from "./types.js";
import type {
  RuntimeAction,
  RuntimeActionCreateResult,
  RuntimeActionSource,
  RuntimeActionValidationCode,
} from "./types.js";

const allowedFields = new Set(["id", "type", "source", "payload"]);
const actionIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

function failure(
  code: RuntimeActionValidationCode,
  path: string,
  message: string,
): RuntimeActionCreateResult {
  return { ok: false, issue: { code, path, message } };
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value);
}

function isRuntimeActionSource(value: unknown): value is RuntimeActionSource {
  return typeof value === "string" && RUNTIME_ACTION_SOURCES.includes(value as RuntimeActionSource);
}

export function createRuntimeAction(input: unknown): RuntimeActionCreateResult {
  const parsed = parseJsonValue(input);
  if (!parsed.ok) return failure("INVALID_TYPE", parsed.issue.path, parsed.issue.reason);
  if (!isJsonObject(parsed.value)) return failure("INVALID_TYPE", "$", "runtime action must be a canonical JSON object");
  const fields = parsed.value;

  const unknownField = Object.keys(fields).sort().find((field) => !allowedFields.has(field));
  if (unknownField) return failure("UNKNOWN_FIELD", `$.${unknownField}`, `unknown runtime action field: ${unknownField}`);

  if (
    typeof fields.id !== "string"
    || fields.id.length < 1
    || fields.id.length > RUNTIME_ACTION_ID_MAX_LENGTH
    || !actionIdPattern.test(fields.id)
  ) {
    return failure(
      "INVALID_ID",
      "$.id",
      `action id must use safe identifier characters and be at most ${RUNTIME_ACTION_ID_MAX_LENGTH} characters`,
    );
  }

  if (typeof fields.type !== "string" || !isSemanticNamespace(fields.type)) {
    return failure("INVALID_ACTION_TYPE", "$.type", "action type must be a lower-case semantic namespace");
  }

  if (!isRuntimeActionSource(fields.source)) {
    return failure("INVALID_SOURCE", "$.source", "action source must be user, host, or system");
  }

  let payload: JsonObject = {};
  if (Object.hasOwn(fields, "payload")) {
    const candidate = fields.payload;
    if (!isJsonObject(candidate)) return failure("INVALID_PAYLOAD", "$.payload", "action payload must be a canonical JSON object");
    payload = candidate;
  }

  const action: RuntimeAction = {
    id: fields.id,
    type: fields.type,
    source: fields.source,
    payload: deepFreezeData(payload),
  };

  return { ok: true, value: Object.freeze(action) };
}
