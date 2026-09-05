import {
  isSemanticNamespace,
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import type {
  ViraCapabilityExactReference,
  ViraCapabilityValidationIssue,
} from "./types.js";

const VERSION_REF = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/;
const FLOATING_ALIASES = new Set(["latest", "current", "stable", "head", "main", "next"]);

export type ViraCapabilityExactReferenceParseResult =
  | { readonly ok: true; readonly value: ViraCapabilityExactReference }
  | { readonly ok: false; readonly issue: ViraCapabilityValidationIssue };

export type ViraCapabilityExactReferenceSerializationResult =
  | {
      readonly ok: true;
      readonly value: string;
      readonly reference: ViraCapabilityExactReference;
    }
  | { readonly ok: false; readonly issue: ViraCapabilityValidationIssue };

function fail(
  code: "INVALID_REFERENCE" | "FLOATING_REFERENCE",
  path: string,
  message: string,
): ViraCapabilityExactReferenceParseResult {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function object(value: JsonValue | undefined): JsonObject | null {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function exactVersionRef(value: JsonValue | undefined): value is string {
  if (typeof value !== "string" || !VERSION_REF.test(value)) return false;
  if (FLOATING_ALIASES.has(value.toLowerCase())) return false;
  return !/(?:^|[._:+-])[xX](?:$|[._:+-])/.test(value)
    && !/\d[xX](?:$|[._:+-])/.test(value);
}

function floatingVersionRef(value: JsonValue | undefined): boolean {
  if (typeof value !== "string" || !VERSION_REF.test(value)) return false;
  return FLOATING_ALIASES.has(value.toLowerCase())
    || /(?:^|[._:+-])[xX](?:$|[._:+-])/.test(value)
    || /\d[xX](?:$|[._:+-])/.test(value);
}

export function parseViraCapabilityExactReference(
  input: unknown,
): ViraCapabilityExactReferenceParseResult {
  const parsed = parseJsonValue(input, "$");
  if (!parsed.ok) return fail("INVALID_REFERENCE", parsed.issue.path, parsed.issue.reason);
  const root = object(parsed.value);
  if (!root) return fail("INVALID_REFERENCE", "$", "reference must be an exact object");
  const keys = Object.keys(root).sort();
  if (
    keys.length !== 2
    || !Object.hasOwn(root, "id")
    || !Object.hasOwn(root, "versionRef")
    || keys.some((key) => key !== "id" && key !== "versionRef")
  ) {
    const unexpected = keys.find((key) => key !== "id" && key !== "versionRef")
      ?? (!Object.hasOwn(root, "id") ? "id" : "versionRef");
    return fail("INVALID_REFERENCE", `$.${unexpected}`, "reference shape is invalid");
  }
  if (typeof root.id !== "string" || !isSemanticNamespace(root.id)) {
    return fail("INVALID_REFERENCE", "$.id", "reference id must be a canonical semantic namespace");
  }
  if (!exactVersionRef(root.versionRef)) {
    return fail(
      floatingVersionRef(root.versionRef) ? "FLOATING_REFERENCE" : "INVALID_REFERENCE",
      "$.versionRef",
      "reference version must be exact and must not float",
    );
  }
  return {
    ok: true,
    value: Object.freeze({ id: root.id, versionRef: root.versionRef }),
  };
}

export function serializeViraCapabilityExactReference(
  input: unknown,
): ViraCapabilityExactReferenceSerializationResult {
  const parsed = parseViraCapabilityExactReference(input);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    value: JSON.stringify(parsed.value),
    reference: parsed.value,
  };
}
