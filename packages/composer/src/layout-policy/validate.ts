import { parseJsonValue } from "@vira-enterprise-genui/protocol";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import { freezeComposerData } from "../internal/freeze.js";
import { LAYOUT_FAMILIES } from "./types.js";
import type {
  LayoutFamily,
  LayoutPolicyResult,
  LayoutPolicyValidationCode,
} from "./types.js";

const policyFields = new Set(["family"]);

function failure(code: LayoutPolicyValidationCode, path: string, message: string): LayoutPolicyResult {
  return { ok: false, issue: { code, path, message } };
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isLayoutFamily(value: unknown): value is LayoutFamily {
  return typeof value === "string" && LAYOUT_FAMILIES.includes(value as LayoutFamily);
}

export function createLayoutPolicy(input: unknown): LayoutPolicyResult {
  const parsed = parseJsonValue(input);
  if (!parsed.ok) return failure("INVALID_TYPE", parsed.issue.path, parsed.issue.reason);
  if (!isJsonObject(parsed.value)) return failure("INVALID_TYPE", "$", "layout policy must be a canonical JSON object");
  const fields = parsed.value;

  const unknownField = Object.keys(fields).sort().find((field) => !policyFields.has(field));
  if (unknownField) return failure("UNKNOWN_FIELD", `$.${unknownField}`, `unknown layout policy field: ${unknownField}`);
  if (!isLayoutFamily(fields.family)) {
    return failure("INVALID_FAMILY", "$.family", "layout family must be a supported semantic layout family");
  }

  return { ok: true, value: freezeComposerData({ family: fields.family }) };
}
