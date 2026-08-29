import {
  isSemanticNamespace,
  parseJsonValue,
} from "@vira-enterprise-genui/protocol";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import { freezeAdapterData } from "../internal/freeze.js";
import {
  BRAND_DISPLAY_NAME_MAX_LENGTH,
  BRAND_PROFILE_VERSION,
  BRAND_TOKEN_ROLES,
} from "./types.js";
import type {
  BrandProfileResult,
  BrandProfileValidationCode,
  BrandTokenRefs,
  BrandTokenRole,
} from "./types.js";

const rootFields = new Set(["version", "id", "displayName", "tokenRefs"]);
const tokenRoles = new Set<BrandTokenRole>(BRAND_TOKEN_ROLES);
const controlCharacterPattern = /[\u0000-\u001F\u007F]/;

function failure(code: BrandProfileValidationCode, path: string, message: string): BrandProfileResult {
  return { ok: false, issue: { code, path, message } };
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value);
}

function isBrandTokenReference(value: unknown): value is string {
  return typeof value === "string" && value.includes(".") && isSemanticNamespace(value);
}

export function createBrandProfile(input: unknown): BrandProfileResult {
  const parsed = parseJsonValue(input);
  if (!parsed.ok) return failure("INVALID_TYPE", parsed.issue.path, parsed.issue.reason);
  if (!isJsonObject(parsed.value)) return failure("INVALID_TYPE", "$", "brand profile must be a canonical JSON object");
  const fields = parsed.value;

  const unknownField = Object.keys(fields).sort().find((field) => !rootFields.has(field));
  if (unknownField) return failure("UNKNOWN_FIELD", `$.${unknownField}`, `unknown brand profile field: ${unknownField}`);
  if (fields.version !== BRAND_PROFILE_VERSION) {
    return failure("INVALID_VERSION", "$.version", `brand profile version must be ${BRAND_PROFILE_VERSION}`);
  }
  if (typeof fields.id !== "string" || !isSemanticNamespace(fields.id)) {
    return failure("INVALID_ID", "$.id", "brand id must be a semantic namespace");
  }
  if (
    typeof fields.displayName !== "string"
    || fields.displayName.length < 1
    || fields.displayName.length > BRAND_DISPLAY_NAME_MAX_LENGTH
    || fields.displayName.trim() !== fields.displayName
    || controlCharacterPattern.test(fields.displayName)
  ) {
    return failure(
      "INVALID_DISPLAY_NAME",
      "$.displayName",
      `displayName must be trimmed, non-empty, free of control characters, and at most ${BRAND_DISPLAY_NAME_MAX_LENGTH} characters`,
    );
  }
  if (!isJsonObject(fields.tokenRefs)) {
    return failure("INVALID_TOKEN_REFS", "$.tokenRefs", "tokenRefs must be a canonical JSON object");
  }

  const tokenRefs: Partial<Record<BrandTokenRole, string>> = {};
  for (const role of Object.keys(fields.tokenRefs).sort()) {
    if (!tokenRoles.has(role as BrandTokenRole)) {
      return failure("UNKNOWN_TOKEN_ROLE", `$.tokenRefs.${role}`, `unknown brand token role: ${role}`);
    }
    const reference = fields.tokenRefs[role];
    if (!isBrandTokenReference(reference)) {
      return failure(
        "INVALID_TOKEN_REFERENCE",
        `$.tokenRefs.${role}`,
        "brand token reference must be a namespaced semantic identifier, not a raw CSS value or URL",
      );
    }
    tokenRefs[role as BrandTokenRole] = reference;
  }

  const value = {
    version: BRAND_PROFILE_VERSION,
    id: fields.id,
    displayName: fields.displayName,
    tokenRefs: tokenRefs as BrandTokenRefs,
  };
  return { ok: true, value: freezeAdapterData(value) };
}
