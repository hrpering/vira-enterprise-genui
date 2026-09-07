import {
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import type {
  ViraArtifactRevisionReference,
  ViraArtifactValidationIssue,
} from "./types.js";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;

export type ViraArtifactRevisionReferenceResult =
  | { readonly ok: true; readonly value: ViraArtifactRevisionReference }
  | { readonly ok: false; readonly issue: ViraArtifactValidationIssue };

function fail(
  code: "INVALID_TYPE" | "UNKNOWN_FIELD" | "INVALID_ID" | "INVALID_REVISION" | "INVALID_DIGEST",
  path: string,
  message: string,
): ViraArtifactRevisionReferenceResult {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function object(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseViraArtifactRevisionReference(input: unknown): ViraArtifactRevisionReferenceResult {
  const parsed = parseJsonValue(input, "$");
  if (!parsed.ok) return fail("INVALID_TYPE", parsed.issue.path, parsed.issue.reason);
  if (!object(parsed.value)) return fail("INVALID_TYPE", "$", "artifact revision reference must be an exact object");
  const value = parsed.value;
  const keys = Object.keys(value);
  const allowed = new Set(["id", "revision", "digest"]);
  const unknown = keys.find((key) => !allowed.has(key));
  if (unknown) return fail("UNKNOWN_FIELD", `$.${unknown}`, "artifact revision reference contains an unknown field");
  for (const required of ["id", "revision", "digest"] as const) {
    if (!Object.hasOwn(value, required)) {
      return fail("INVALID_TYPE", `$.${required}`, "artifact revision reference is missing a required field");
    }
  }
  if (typeof value.id !== "string" || !ID.test(value.id)) {
    return fail("INVALID_ID", "$.id", "artifact reference id is invalid");
  }
  if (typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 1) {
    return fail("INVALID_REVISION", "$.revision", "artifact reference revision must be a positive safe integer");
  }
  if (typeof value.digest !== "string" || !SHA256.test(value.digest)) {
    return fail("INVALID_DIGEST", "$.digest", "artifact reference digest must be exact lowercase sha256");
  }
  return {
    ok: true,
    value: Object.freeze({ id: value.id, revision: value.revision, digest: value.digest }),
  };
}
