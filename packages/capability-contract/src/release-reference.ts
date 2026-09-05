import {
  isSemanticNamespace,
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import type { ViraCapabilityValidationIssue } from "./types.js";

const RELEASE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export interface ViraCapabilityReleaseReference {
  readonly id: string;
  readonly version: string;
}

export type ViraCapabilityReleaseReferenceParseResult =
  | { readonly ok: true; readonly value: ViraCapabilityReleaseReference }
  | { readonly ok: false; readonly issue: ViraCapabilityValidationIssue };

export type ViraCapabilityReleaseReferenceSerializationResult =
  | {
      readonly ok: true;
      readonly value: string;
      readonly reference: ViraCapabilityReleaseReference;
    }
  | { readonly ok: false; readonly issue: ViraCapabilityValidationIssue };

function fail(
  code: "INVALID_ID" | "INVALID_VERSION",
  path: string,
  message: string,
): ViraCapabilityReleaseReferenceParseResult {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function object(value: JsonValue | undefined): JsonObject | null {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

export function parseViraCapabilityReleaseReference(
  input: unknown,
): ViraCapabilityReleaseReferenceParseResult {
  const parsed = parseJsonValue(input);
  if (!parsed.ok) return fail("INVALID_ID", parsed.issue.path, parsed.issue.reason);
  const root = object(parsed.value);
  if (!root) return fail("INVALID_ID", "$", "Capability release reference must be an exact object");
  const keys = Object.keys(root);
  if (
    keys.length !== 2
    || !Object.hasOwn(root, "id")
    || !Object.hasOwn(root, "version")
    || keys.some((key) => key !== "id" && key !== "version")
  ) {
    return fail("INVALID_ID", "$", "Capability release reference shape is invalid");
  }
  if (
    typeof root.id !== "string"
    || !isSemanticNamespace(root.id)
    || !root.id.includes(".")
  ) {
    return fail("INVALID_ID", "$.id", "Capability id must be a namespaced semantic identity");
  }
  if (
    typeof root.version !== "string"
    || root.version.length > 64
    || !RELEASE_VERSION.test(root.version)
  ) {
    return fail("INVALID_VERSION", "$.version", "Capability release version must be exact semver");
  }
  return {
    ok: true,
    value: Object.freeze({ id: root.id, version: root.version }),
  };
}

export function serializeViraCapabilityReleaseReference(
  input: unknown,
): ViraCapabilityReleaseReferenceSerializationResult {
  const parsed = parseViraCapabilityReleaseReference(input);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    value: JSON.stringify(parsed.value),
    reference: parsed.value,
  };
}
