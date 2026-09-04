import {
  parseViraApplicationPackage,
  serializeViraApplicationPackage,
} from "@vira-enterprise-genui/application-package";
import { parseJsonValue } from "@vira-enterprise-genui/protocol";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import {
  VIRA_APPLICATION_DISTRIBUTION_INTEGRITY_ALGORITHM,
  VIRA_APPLICATION_DISTRIBUTION_SCHEMA_VERSION,
  VIRA_APPLICATION_DISTRIBUTION_SHA256_HEX_LENGTH,
} from "./types.js";
import type {
  ViraApplicationArtifactIntegrity,
  ViraApplicationDistributionEnvelope,
  ViraApplicationDistributionIntegrityVerifier,
  ViraApplicationDistributionIssue,
  ViraApplicationDistributionResult,
  ViraApplicationDistributionSerializationResult,
  ViraApplicationDistributionValidationCode,
} from "./types.js";

const ROOT_FIELDS = new Set(["schemaVersion", "application", "integrity"]);
const INTEGRITY_FIELDS = new Set(["algorithm", "digest"]);
const SHA256_HEX = /^[0-9a-f]{64}$/;

type DistributionFailure = {
  readonly ok: false;
  readonly issue: ViraApplicationDistributionIssue;
};

function issue(
  code: ViraApplicationDistributionValidationCode,
  path: string,
  message: string,
  applicationCode?: ViraApplicationDistributionIssue["applicationCode"],
): DistributionFailure {
  return {
    ok: false,
    issue: applicationCode === undefined
      ? { code, path, message }
      : { code, path, message, applicationCode },
  };
}

function asObject(value: JsonValue | undefined): JsonObject | null {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

function firstUnknownField(object: JsonObject, allowed: ReadonlySet<string>): string | null {
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) return key;
  }
  return null;
}

function applicationPath(path: string): string {
  if (path === "$" || path.length === 0) return "$.application";
  return `$.application${path.startsWith("$") ? path.slice(1) : `.${path}`}`;
}

function parseIntegrity(value: JsonValue | undefined):
  | { readonly ok: true; readonly value: ViraApplicationArtifactIntegrity }
  | DistributionFailure {
  const object = asObject(value);
  if (!object) return issue("INVALID_INTEGRITY", "$.integrity", "integrity must be an object");

  const unknown = firstUnknownField(object, INTEGRITY_FIELDS);
  if (unknown) return issue("UNKNOWN_FIELD", `$.integrity.${unknown}`, "unknown integrity field");

  if (object.algorithm !== VIRA_APPLICATION_DISTRIBUTION_INTEGRITY_ALGORITHM) {
    return issue(
      "INVALID_INTEGRITY",
      "$.integrity.algorithm",
      `integrity algorithm must be ${VIRA_APPLICATION_DISTRIBUTION_INTEGRITY_ALGORITHM}`,
    );
  }

  if (
    typeof object.digest !== "string"
    || object.digest.length !== VIRA_APPLICATION_DISTRIBUTION_SHA256_HEX_LENGTH
    || !SHA256_HEX.test(object.digest)
  ) {
    return issue(
      "INVALID_INTEGRITY",
      "$.integrity.digest",
      "digest must be exactly 64 lowercase hexadecimal characters",
    );
  }

  return {
    ok: true,
    value: Object.freeze({
      algorithm: VIRA_APPLICATION_DISTRIBUTION_INTEGRITY_ALGORITHM,
      digest: object.digest,
    }),
  };
}

export function parseViraApplicationDistributionEnvelope(input: unknown): ViraApplicationDistributionResult {
  const json = parseJsonValue(input);
  if (!json.ok) return issue("INVALID_INPUT", json.issue.path, json.issue.reason);

  const object = asObject(json.value);
  if (!object) return issue("INVALID_INPUT", "$", "distribution envelope must be an object");

  const unknown = firstUnknownField(object, ROOT_FIELDS);
  if (unknown) return issue("UNKNOWN_FIELD", `$.${unknown}`, "unknown distribution envelope field");

  if (object.schemaVersion !== VIRA_APPLICATION_DISTRIBUTION_SCHEMA_VERSION) {
    return issue(
      "INVALID_SCHEMA_VERSION",
      "$.schemaVersion",
      `schemaVersion must be ${VIRA_APPLICATION_DISTRIBUTION_SCHEMA_VERSION}`,
    );
  }

  if (!("application" in object)) return issue("INVALID_APPLICATION", "$.application", "application is required");
  const application = parseViraApplicationPackage(object.application);
  if (!application.ok) {
    return issue(
      "INVALID_APPLICATION",
      applicationPath(application.issue.path),
      application.issue.message,
      application.issue.code,
    );
  }

  const integrity = parseIntegrity(object.integrity);
  if (!integrity.ok) return integrity;

  const envelope: ViraApplicationDistributionEnvelope = Object.freeze({
    schemaVersion: VIRA_APPLICATION_DISTRIBUTION_SCHEMA_VERSION,
    application: application.value,
    integrity: integrity.value,
  });
  return { ok: true, value: envelope };
}

export function serializeViraApplicationDistributionEnvelope(input: unknown): ViraApplicationDistributionSerializationResult {
  const parsed = parseViraApplicationDistributionEnvelope(input);
  if (!parsed.ok) return parsed;

  const serializedApplication = serializeViraApplicationPackage(parsed.value.application);
  if (!serializedApplication.ok) {
    return issue(
      "INVALID_APPLICATION",
      applicationPath(serializedApplication.issue.path),
      serializedApplication.issue.message,
      serializedApplication.issue.code,
    );
  }

  const digest = JSON.stringify(parsed.value.integrity.digest);
  return {
    ok: true,
    value: `{"schemaVersion":"${VIRA_APPLICATION_DISTRIBUTION_SCHEMA_VERSION}","application":${serializedApplication.value},"integrity":{"algorithm":"${VIRA_APPLICATION_DISTRIBUTION_INTEGRITY_ALGORITHM}","digest":${digest}}}`,
    envelope: parsed.value,
  };
}

export async function verifyViraApplicationDistributionIntegrity(
  input: unknown,
  verifier: unknown,
): Promise<ViraApplicationDistributionResult> {
  const parsed = parseViraApplicationDistributionEnvelope(input);
  if (!parsed.ok) return parsed;
  if (typeof verifier !== "function") return issue("INVALID_VERIFIER", "$verifier", "integrity verifier must be a function");

  const serializedApplication = serializeViraApplicationPackage(parsed.value.application);
  if (!serializedApplication.ok) {
    return issue(
      "INVALID_APPLICATION",
      applicationPath(serializedApplication.issue.path),
      serializedApplication.issue.message,
      serializedApplication.issue.code,
    );
  }

  try {
    const verified = await (verifier as ViraApplicationDistributionIntegrityVerifier)(Object.freeze({
      algorithm: parsed.value.integrity.algorithm,
      digest: parsed.value.integrity.digest,
      canonicalArtifact: serializedApplication.value,
    }));
    if (verified !== true) {
      return issue(
        "INTEGRITY_VERIFICATION_FAILED",
        "$.integrity.digest",
        "application artifact integrity verification failed",
      );
    }
    return parsed;
  } catch {
    return issue("INTEGRITY_VERIFIER_FAILED", "$verifier", "integrity verifier failed closed");
  }
}
