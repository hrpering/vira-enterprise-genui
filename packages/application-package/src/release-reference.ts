import {
  isSemanticNamespace,
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import type {
  ViraApplicationPackageValidationIssue,
} from "./types.js";

const RELEASE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export interface ViraApplicationReleaseReference {
  readonly id: string;
  readonly version: string;
}

export type ViraApplicationReleaseReferenceParseResult =
  | { readonly ok: true; readonly value: ViraApplicationReleaseReference }
  | { readonly ok: false; readonly issue: ViraApplicationPackageValidationIssue };

export type ViraApplicationReleaseReferenceSerializationResult =
  | {
      readonly ok: true;
      readonly value: string;
      readonly reference: ViraApplicationReleaseReference;
    }
  | { readonly ok: false; readonly issue: ViraApplicationPackageValidationIssue };

function fail(
  code: "INVALID_IDENTITY" | "INVALID_VERSION",
  path: string,
  message: string,
): ViraApplicationReleaseReferenceParseResult {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function object(value: JsonValue | undefined): JsonObject | null {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

export function parseViraApplicationReleaseReference(
  input: unknown,
): ViraApplicationReleaseReferenceParseResult {
  const parsed = parseJsonValue(input);
  if (!parsed.ok) return fail("INVALID_IDENTITY", parsed.issue.path, parsed.issue.reason);
  const root = object(parsed.value);
  if (!root) return fail("INVALID_IDENTITY", "$", "Application release reference must be an exact object");
  const keys = Object.keys(root);
  if (
    keys.length !== 2
    || !Object.hasOwn(root, "id")
    || !Object.hasOwn(root, "version")
    || keys.some((key) => key !== "id" && key !== "version")
  ) {
    return fail("INVALID_IDENTITY", "$", "Application release reference shape is invalid");
  }
  if (
    typeof root.id !== "string"
    || !isSemanticNamespace(root.id)
    || !root.id.includes(".")
  ) {
    return fail("INVALID_IDENTITY", "$.id", "Application id must be a namespaced semantic identity");
  }
  if (
    typeof root.version !== "string"
    || root.version.length > 64
    || !RELEASE_VERSION.test(root.version)
  ) {
    return fail("INVALID_VERSION", "$.version", "Application release version must be exact semver");
  }
  return {
    ok: true,
    value: Object.freeze({ id: root.id, version: root.version }),
  };
}

export function serializeViraApplicationReleaseReference(
  input: unknown,
): ViraApplicationReleaseReferenceSerializationResult {
  const parsed = parseViraApplicationReleaseReference(input);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    value: JSON.stringify(parsed.value),
    reference: parsed.value,
  };
}
