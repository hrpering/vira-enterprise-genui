import { readDataObjectInput } from "../object-input.js";
import { isSemanticNamespace } from "../semantic-id.js";
import { CAPABILITY_PROTOCOL_VERSION } from "./types.js";
import type { Capability, CapabilityParseResult, CapabilityValidationCode } from "./types.js";

const allowedFields = new Set(["version", "id"]);

function failure(code: CapabilityValidationCode, path: string, message: string): CapabilityParseResult {
  return { ok: false, issue: { code, path, message } };
}

export function parseCapability(value: unknown): CapabilityParseResult {
  const input = readDataObjectInput(value);
  if (!input.ok) return failure("INVALID_TYPE", input.issue.path, input.issue.reason);
  const fields = input.value;

  const unknownField = Object.keys(fields).sort().find((field) => !allowedFields.has(field));
  if (unknownField) return failure("UNKNOWN_FIELD", `$.${unknownField}`, `unknown capability field: ${unknownField}`);

  if (fields.version !== CAPABILITY_PROTOCOL_VERSION) {
    return failure("INVALID_VERSION", "$.version", `capability version must be ${CAPABILITY_PROTOCOL_VERSION}`);
  }

  if (typeof fields.id !== "string" || !isSemanticNamespace(fields.id)) {
    return failure("INVALID_ID", "$.id", "capability id must be a lower-case semantic namespace");
  }

  return {
    ok: true,
    value: {
      version: CAPABILITY_PROTOCOL_VERSION,
      id: fields.id,
    },
  };
}

export function isCapability(value: unknown): value is Capability {
  return parseCapability(value).ok;
}
