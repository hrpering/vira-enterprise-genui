import { parseJsonValue } from "../json-value.js";
import type { JsonObject, JsonValue } from "../json-value.js";
import { readDataObjectInput } from "../object-input.js";
import {
  PATCH_MAX_OPERATIONS,
  PATCH_PATH_MAX_LENGTH,
  PATCH_PROTOCOL_VERSION,
} from "./types.js";
import type {
  Patch,
  PatchOperation,
  PatchParseResult,
  PatchValidationCode,
} from "./types.js";

const patchFields = new Set(["version", "operations"]);
const valueOperationFields = new Set(["op", "path", "value"]);
const removeOperationFields = new Set(["op", "path"]);
const supportedOperations = new Set(["set", "remove", "merge", "append", "replace"]);
const unsafeObjectKeys = new Set(["__proto__", "prototype", "constructor"]);
const controlCharacterPattern = /[\u0000-\u001f\u007f]/;

function failure(code: PatchValidationCode, path: string, message: string): PatchParseResult {
  return { ok: false, issue: { code, path, message } };
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validatePatchPath(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length < 2 || value.length > PATCH_PATH_MAX_LENGTH || !value.startsWith("/")) {
    return `path must begin with / and be at most ${PATCH_PATH_MAX_LENGTH} characters`;
  }
  if (controlCharacterPattern.test(value)) return "path must not contain control characters";

  for (const rawSegment of value.slice(1).split("/")) {
    if (rawSegment.length === 0) return "path segments must not be empty";
    if (/~(?![01])/u.test(rawSegment)) return "path contains an invalid JSON Pointer escape";
    const decoded = rawSegment.replace(/~1/g, "/").replace(/~0/g, "~");
    if (unsafeObjectKeys.has(decoded)) return `path segment ${decoded} is not allowed`;
    if (controlCharacterPattern.test(decoded)) return "decoded path segments must not contain control characters";
  }
  return undefined;
}

function unsafeValueKeyPath(value: JsonValue, valuePath: string): string | undefined {
  if (value === null || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const child = value[index];
      if (child === undefined) continue;
      const unsafe = unsafeValueKeyPath(child, `${valuePath}[${index}]`);
      if (unsafe) return unsafe;
    }
    return undefined;
  }

  for (const key of Object.keys(value)) {
    if (unsafeObjectKeys.has(key)) return `${valuePath}.${key}`;
    const child = value[key];
    if (child === undefined) continue;
    const unsafe = unsafeValueKeyPath(child, `${valuePath}.${key}`);
    if (unsafe) return unsafe;
  }
  return undefined;
}

function parseOperation(
  value: unknown,
  index: number,
):
  | { readonly ok: true; readonly value: PatchOperation }
  | { readonly ok: false; readonly code: PatchValidationCode; readonly path: string; readonly message: string } {
  const basePath = `$.operations[${index}]`;
  const input = readDataObjectInput(value, basePath);
  if (!input.ok) return { ok: false, code: "INVALID_OPERATION", path: input.issue.path, message: input.issue.reason };
  const fields = input.value;

  if (typeof fields.op !== "string" || !supportedOperations.has(fields.op)) {
    return { ok: false, code: "INVALID_OPERATION", path: `${basePath}.op`, message: "unsupported patch operation" };
  }

  const allowed = fields.op === "remove" ? removeOperationFields : valueOperationFields;
  const unknownField = Object.keys(fields).sort().find((field) => !allowed.has(field));
  if (unknownField) {
    return {
      ok: false,
      code: "INVALID_OPERATION",
      path: `${basePath}.${unknownField}`,
      message: `unknown field for ${fields.op} operation: ${unknownField}`,
    };
  }

  const pathIssue = validatePatchPath(fields.path);
  if (pathIssue) return { ok: false, code: "INVALID_PATH", path: `${basePath}.path`, message: pathIssue };
  const path = fields.path as string;

  if (fields.op === "remove") return { ok: true, value: { op: "remove", path } };

  const parsedValue = parseJsonValue(fields.value, `${basePath}.value`);
  if (!parsedValue.ok) {
    return { ok: false, code: "INVALID_VALUE", path: parsedValue.issue.path, message: parsedValue.issue.reason };
  }

  const unsafeKeyPath = unsafeValueKeyPath(parsedValue.value, `${basePath}.value`);
  if (unsafeKeyPath) {
    return {
      ok: false,
      code: "INVALID_VALUE",
      path: unsafeKeyPath,
      message: "patch values must not contain prototype-sensitive object keys",
    };
  }

  if (fields.op === "merge") {
    if (!isJsonObject(parsedValue.value)) {
      return { ok: false, code: "INVALID_VALUE", path: `${basePath}.value`, message: "merge value must be a canonical JSON object" };
    }
    return { ok: true, value: { op: "merge", path, value: parsedValue.value } };
  }

  if (fields.op === "set") return { ok: true, value: { op: "set", path, value: parsedValue.value } };
  if (fields.op === "append") return { ok: true, value: { op: "append", path, value: parsedValue.value } };
  return { ok: true, value: { op: "replace", path, value: parsedValue.value } };
}

export function parsePatch(value: unknown): PatchParseResult {
  const input = readDataObjectInput(value);
  if (!input.ok) return failure("INVALID_TYPE", input.issue.path, input.issue.reason);
  const fields = input.value;

  const unknownField = Object.keys(fields).sort().find((field) => !patchFields.has(field));
  if (unknownField) return failure("UNKNOWN_FIELD", `$.${unknownField}`, `unknown patch field: ${unknownField}`);

  if (fields.version !== PATCH_PROTOCOL_VERSION) {
    return failure("INVALID_VERSION", "$.version", `patch version must be ${PATCH_PROTOCOL_VERSION}`);
  }

  if (!Array.isArray(fields.operations)) {
    return failure("INVALID_OPERATIONS", "$.operations", "operations must be an array");
  }
  if (fields.operations.length > PATCH_MAX_OPERATIONS) {
    return failure(
      "OPERATION_LIMIT_EXCEEDED",
      "$.operations",
      `patch may contain at most ${PATCH_MAX_OPERATIONS} operations`,
    );
  }

  const canonicalOperations = parseJsonValue(fields.operations, "$.operations");
  if (!canonicalOperations.ok) {
    return failure("INVALID_OPERATIONS", canonicalOperations.issue.path, canonicalOperations.issue.reason);
  }
  if (!Array.isArray(canonicalOperations.value)) {
    return failure("INVALID_OPERATIONS", "$.operations", "operations must be an array");
  }

  const operations: PatchOperation[] = [];
  for (let index = 0; index < canonicalOperations.value.length; index += 1) {
    const operation = parseOperation(canonicalOperations.value[index], index);
    if (!operation.ok) return failure(operation.code, operation.path, operation.message);
    operations.push(operation.value);
  }

  return { ok: true, value: { version: PATCH_PROTOCOL_VERSION, operations } };
}

export function isPatch(value: unknown): value is Patch {
  return parsePatch(value).ok;
}
