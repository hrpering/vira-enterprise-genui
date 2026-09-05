import {
  parseViraApplicationPackageV2,
  serializeViraApplicationPackageV2,
} from "@vira-enterprise-genui/application-package";
import { parseJsonValue } from "@vira-enterprise-genui/protocol";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import {
  VIRA_APPLICATION_DISTRIBUTION_INTEGRITY_ALGORITHM,
  VIRA_APPLICATION_DISTRIBUTION_SHA256_HEX_LENGTH,
  type ViraApplicationArtifactIntegrity,
} from "./types.js";
import {
  VIRA_APPLICATION_DISTRIBUTION_V2_SCHEMA_VERSION,
  type ViraApplicationDistributionEnvelopeV2,
  type ViraApplicationDistributionV2Issue,
  type ViraApplicationDistributionV2Result,
  type ViraApplicationDistributionV2SerializationResult,
  type ViraApplicationDistributionV2ValidationCode,
} from "./v2-types.js";

const ROOT_FIELDS = new Set(["schemaVersion", "application", "integrity"]);
const INTEGRITY_FIELDS = new Set(["algorithm", "digest"]);
const SHA256_HEX = /^[0-9a-f]{64}$/;

type Failure = { readonly ok: false; readonly issue: ViraApplicationDistributionV2Issue };

function issue(
  code: ViraApplicationDistributionV2ValidationCode,
  path: string,
  message: string,
  applicationCode?: ViraApplicationDistributionV2Issue["applicationCode"],
): Failure {
  return {
    ok: false,
    issue: Object.freeze({
      code,
      path,
      message,
      ...(applicationCode === undefined ? {} : { applicationCode }),
    }),
  };
}

function object(value: JsonValue | undefined): JsonObject | null {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function unknownField(value: JsonObject, allowed: ReadonlySet<string>): string | null {
  for (const key of Object.keys(value)) if (!allowed.has(key)) return key;
  return null;
}

function nestedPath(base: string, child: string): string {
  return child === "$" ? base : `${base}${child.slice(1)}`;
}

function parseIntegrity(value: JsonValue | undefined):
  | { readonly ok: true; readonly value: ViraApplicationArtifactIntegrity }
  | Failure {
  const root = object(value);
  if (!root) return issue("INVALID_INTEGRITY", "$.integrity", "integrity must be an exact object");
  const unexpected = unknownField(root, INTEGRITY_FIELDS);
  if (unexpected) return issue("UNKNOWN_FIELD", `$.integrity.${unexpected}`, "unknown integrity field");
  if (!Object.hasOwn(root, "algorithm") || !Object.hasOwn(root, "digest")) {
    return issue("INVALID_INTEGRITY", "$.integrity", "integrity algorithm and digest are required");
  }
  if (root.algorithm !== VIRA_APPLICATION_DISTRIBUTION_INTEGRITY_ALGORITHM) {
    return issue("INVALID_INTEGRITY", "$.integrity.algorithm", "integrity algorithm must be sha256");
  }
  if (
    typeof root.digest !== "string"
    || root.digest.length !== VIRA_APPLICATION_DISTRIBUTION_SHA256_HEX_LENGTH
    || !SHA256_HEX.test(root.digest)
  ) {
    return issue("INVALID_INTEGRITY", "$.integrity.digest", "digest must be exactly 64 lowercase hexadecimal characters");
  }
  return {
    ok: true,
    value: Object.freeze({ algorithm: VIRA_APPLICATION_DISTRIBUTION_INTEGRITY_ALGORITHM, digest: root.digest }),
  };
}

export function parseViraApplicationDistributionEnvelopeV2(input: unknown): ViraApplicationDistributionV2Result {
  const parsed = parseJsonValue(input, "$");
  if (!parsed.ok) return issue("INVALID_INPUT", parsed.issue.path, parsed.issue.reason);
  const root = object(parsed.value);
  if (!root) return issue("INVALID_INPUT", "$", "Application distribution V2 envelope must be an exact object");
  const unexpected = unknownField(root, ROOT_FIELDS);
  if (unexpected) return issue("UNKNOWN_FIELD", `$.${unexpected}`, "unknown distribution envelope field");
  for (const required of ROOT_FIELDS) {
    if (!Object.hasOwn(root, required)) return issue("INVALID_INPUT", `$.${required}`, "missing distribution envelope field");
  }
  if (root.schemaVersion !== VIRA_APPLICATION_DISTRIBUTION_V2_SCHEMA_VERSION) {
    return issue(
      "INVALID_SCHEMA_VERSION",
      "$.schemaVersion",
      `schemaVersion must be ${VIRA_APPLICATION_DISTRIBUTION_V2_SCHEMA_VERSION}`,
    );
  }
  const application = parseViraApplicationPackageV2(root.application);
  if (!application.ok) {
    return issue(
      "INVALID_APPLICATION",
      nestedPath("$.application", application.issue.path),
      application.issue.message,
      application.issue.code,
    );
  }
  const integrity = parseIntegrity(root.integrity);
  if (!integrity.ok) return integrity;
  const envelope: ViraApplicationDistributionEnvelopeV2 = Object.freeze({
    schemaVersion: VIRA_APPLICATION_DISTRIBUTION_V2_SCHEMA_VERSION,
    application: application.value,
    integrity: integrity.value,
  });
  return { ok: true, value: envelope };
}

export function serializeViraApplicationDistributionEnvelopeV2(
  input: unknown,
): ViraApplicationDistributionV2SerializationResult {
  const parsed = parseViraApplicationDistributionEnvelopeV2(input);
  if (!parsed.ok) return parsed;
  const application = serializeViraApplicationPackageV2(parsed.value.application);
  if (!application.ok) {
    return issue(
      "INVALID_APPLICATION",
      nestedPath("$.application", application.issue.path),
      application.issue.message,
      application.issue.code,
    );
  }
  return {
    ok: true,
    value: `{"schemaVersion":"${VIRA_APPLICATION_DISTRIBUTION_V2_SCHEMA_VERSION}","application":${application.value},"integrity":{"algorithm":"${VIRA_APPLICATION_DISTRIBUTION_INTEGRITY_ALGORITHM}","digest":${JSON.stringify(parsed.value.integrity.digest)}}}`,
    envelope: parsed.value,
  };
}

export async function verifyViraApplicationDistributionIntegrityV2(
  input: unknown,
  verifier: unknown,
): Promise<ViraApplicationDistributionV2Result> {
  const parsed = parseViraApplicationDistributionEnvelopeV2(input);
  if (!parsed.ok) return parsed;
  if (typeof verifier !== "function") return issue("INVALID_VERIFIER", "$verifier", "integrity verifier must be a function");
  const application = serializeViraApplicationPackageV2(parsed.value.application);
  if (!application.ok) {
    return issue(
      "INVALID_APPLICATION",
      nestedPath("$.application", application.issue.path),
      application.issue.message,
      application.issue.code,
    );
  }
  try {
    const verified = await (verifier as (input: {
      readonly algorithm: "sha256";
      readonly digest: string;
      readonly canonicalArtifact: string;
    }) => boolean | Promise<boolean>)(Object.freeze({
      algorithm: parsed.value.integrity.algorithm,
      digest: parsed.value.integrity.digest,
      canonicalArtifact: application.value,
    }));
    if (verified !== true) {
      return issue("INTEGRITY_VERIFICATION_FAILED", "$.integrity.digest", "Application V2 artifact integrity verification failed");
    }
    return parsed;
  } catch {
    return issue("INTEGRITY_VERIFIER_FAILED", "$verifier", "integrity verifier failed closed");
  }
}
