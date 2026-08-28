import { parseJsonValue } from "../json-value.js";
import type { JsonObject } from "../json-value.js";
import { readDataObjectInput } from "../object-input.js";
import { isSemanticNamespace, isSemanticSegment } from "../semantic-id.js";
import { INTENT_PROTOCOL_VERSION } from "./types.js";
import type { Intent, IntentParseResult, IntentValidationCode } from "./types.js";

const allowedFields = new Set(["version", "namespace", "name", "confidence", "parameters"]);

function failure(code: IntentValidationCode, path: string, message: string): IntentParseResult {
  return { ok: false, issue: { code, path, message } };
}

export function parseIntent(value: unknown): IntentParseResult {
  const input = readDataObjectInput(value);
  if (!input.ok) return failure("INVALID_TYPE", input.issue.path, input.issue.reason);
  const fields = input.value;

  const unknownField = Object.keys(fields).sort().find((field) => !allowedFields.has(field));
  if (unknownField) return failure("UNKNOWN_FIELD", `$.${unknownField}`, `unknown intent field: ${unknownField}`);

  if (fields.version !== INTENT_PROTOCOL_VERSION) {
    return failure("INVALID_VERSION", "$.version", `intent version must be ${INTENT_PROTOCOL_VERSION}`);
  }

  if (typeof fields.namespace !== "string" || !isSemanticNamespace(fields.namespace)) {
    return failure("INVALID_NAMESPACE", "$.namespace", "namespace must be lower-case dot-delimited semantic segments of at most 63 characters each");
  }

  if (typeof fields.name !== "string" || !isSemanticSegment(fields.name)) {
    return failure("INVALID_NAME", "$.name", "name must be one lower-case semantic segment of at most 63 characters");
  }

  let confidence: number | undefined;
  if (Object.hasOwn(fields, "confidence")) {
    if (typeof fields.confidence !== "number" || !Number.isFinite(fields.confidence) || fields.confidence < 0 || fields.confidence > 1) {
      return failure("INVALID_CONFIDENCE", "$.confidence", "confidence must be a finite number between 0 and 1");
    }
    confidence = fields.confidence;
  }

  let parameters: JsonObject | undefined;
  if (Object.hasOwn(fields, "parameters")) {
    const parameterInput = readDataObjectInput(fields.parameters, "$.parameters");
    if (!parameterInput.ok) return failure("INVALID_PARAMETERS", parameterInput.issue.path, parameterInput.issue.reason);
    const parsed = parseJsonValue(fields.parameters, "$.parameters");
    if (!parsed.ok || parsed.value === null || Array.isArray(parsed.value) || typeof parsed.value !== "object") {
      const detail = parsed.ok ? "parameters must be a JSON object" : parsed.issue.reason;
      const issuePath = parsed.ok ? "$.parameters" : parsed.issue.path;
      return failure("INVALID_PARAMETERS", issuePath, detail);
    }
    parameters = parsed.value as JsonObject;
  }

  const normalized: Intent = {
    version: INTENT_PROTOCOL_VERSION,
    namespace: fields.namespace,
    name: fields.name,
    ...(confidence === undefined ? {} : { confidence }),
    ...(parameters === undefined ? {} : { parameters }),
  };

  return { ok: true, value: normalized };
}

export function isIntent(value: unknown): value is Intent {
  return parseIntent(value).ok;
}

export function intentKey(intent: Pick<Intent, "namespace" | "name">): string {
  return `${intent.namespace}.${intent.name}`;
}
