import {
  verifyViraApplicationDistributionIntegrity,
  type ViraApplicationDistributionIntegrityVerifier,
  type ViraApplicationDistributionValidationCode,
} from "@vira-enterprise-genui/application-distribution";
import {
  VIRA_APPLICATION_PACKAGE_MAX_REFERENCES,
  parseViraApplicationExactReference,
  type ViraApplicationExactReference,
} from "@vira-enterprise-genui/application-package";
import {
  isSemanticNamespace,
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import { VIRA_APPLICATION_AI_HOST_SDK_VERSION } from "./types.js";
import type {
  ViraApplicationAiHostDescriptor,
  ViraApplicationAiHostIssue,
  ViraApplicationAiHostIssueCode,
  ViraApplicationAiHostResult,
} from "./types.js";

const ROOT_FIELDS = new Set(["source", "host"]);
const HOST_FIELDS = new Set(["viraVersion", "capabilities", "protocolProjections"]);
const RELEASE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

interface Failure {
  readonly ok: false;
  readonly issue: ViraApplicationAiHostIssue;
}

type Parsed<T> = { readonly ok: true; readonly value: T } | Failure;

function failure(
  code: ViraApplicationAiHostIssueCode,
  path: string,
  message: string,
  distributionCode?: ViraApplicationDistributionValidationCode,
): Failure {
  return {
    ok: false,
    issue: Object.freeze(distributionCode === undefined
      ? { code, path, message }
      : { code, path, message, distributionCode }),
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

function releaseVersion(value: JsonValue | undefined): value is string {
  return typeof value === "string" && value.length <= 64 && RELEASE_VERSION.test(value);
}

function compareRelease(left: string, right: string): number {
  const a = left.split(".").map((part) => BigInt(part));
  const b = right.split(".").map((part) => BigInt(part));
  for (let index = 0; index < 3; index += 1) {
    const av = a[index] ?? 0n;
    const bv = b[index] ?? 0n;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

function refKey(ref: ViraApplicationExactReference): string {
  return `${ref.id}\u0000${ref.versionRef}`;
}

function hostReferencePath(ownerPath: string, path: string): string {
  if (ownerPath === "$" || ownerPath.length === 0) return path;
  if (ownerPath.startsWith("$.")) return `${path}${ownerPath.slice(1)}`;
  return path;
}

function parseHostReference(value: JsonValue, path: string): Parsed<ViraApplicationExactReference> {
  const parsed = parseViraApplicationExactReference(value);
  if (parsed.ok) return parsed;
  return failure(
    "INVALID_HOST",
    hostReferencePath(parsed.issue.path, path),
    parsed.issue.message,
  );
}

function parseHost(value: JsonValue | undefined): Parsed<ViraApplicationAiHostDescriptor> {
  const object = asObject(value);
  if (!object) return failure("INVALID_HOST", "$.host", "host must be an exact object");
  const unknown = firstUnknownField(object, HOST_FIELDS);
  if (unknown) return failure("UNKNOWN_FIELD", `$.host.${unknown}`, "unknown host field");

  if (!releaseVersion(object.viraVersion)) {
    return failure("INVALID_HOST", "$.host.viraVersion", "host viraVersion must be an exact release semver");
  }

  if (!Array.isArray(object.capabilities) || object.capabilities.length > VIRA_APPLICATION_PACKAGE_MAX_REFERENCES) {
    return failure("INVALID_HOST", "$.host.capabilities", "host capabilities must be a bounded array");
  }
  const capabilities: string[] = [];
  const capabilitySet = new Set<string>();
  for (let index = 0; index < object.capabilities.length; index += 1) {
    const capability = object.capabilities[index];
    if (typeof capability !== "string" || !isSemanticNamespace(capability)) {
      return failure("INVALID_HOST", `$.host.capabilities[${index}]`, "host capability id must be canonical");
    }
    if (capabilitySet.has(capability)) {
      return failure("INVALID_HOST", `$.host.capabilities[${index}]`, "duplicate host capability id");
    }
    capabilitySet.add(capability);
    capabilities.push(capability);
  }
  capabilities.sort();

  if (
    !Array.isArray(object.protocolProjections)
    || object.protocolProjections.length > VIRA_APPLICATION_PACKAGE_MAX_REFERENCES
  ) {
    return failure("INVALID_HOST", "$.host.protocolProjections", "host protocol projections must be a bounded array");
  }
  const protocolProjections: ViraApplicationExactReference[] = [];
  const projectionSet = new Set<string>();
  for (let index = 0; index < object.protocolProjections.length; index += 1) {
    const parsed = parseHostReference(
      object.protocolProjections[index] as JsonValue,
      `$.host.protocolProjections[${index}]`,
    );
    if (!parsed.ok) return parsed;
    const key = refKey(parsed.value);
    if (projectionSet.has(key)) {
      return failure("INVALID_HOST", `$.host.protocolProjections[${index}]`, "duplicate host protocol projection reference");
    }
    projectionSet.add(key);
    protocolProjections.push(parsed.value);
  }
  protocolProjections.sort((left, right) => refKey(left).localeCompare(refKey(right)));

  return {
    ok: true,
    value: Object.freeze({
      viraVersion: object.viraVersion,
      capabilities: Object.freeze(capabilities),
      protocolProjections: Object.freeze(protocolProjections),
    }),
  };
}

function sourcePath(path: string): string {
  if (path === "$" || path.length === 0) return "$.source";
  return `$.source${path.startsWith("$") ? path.slice(1) : `.${path}`}`;
}

function mapDistributionFailure(
  code: ViraApplicationDistributionValidationCode,
  path: string,
  message: string,
): Failure {
  if (code === "INVALID_VERIFIER") {
    return failure("INVALID_INTEGRITY_VERIFIER", "$integrityVerifier", message, code);
  }
  if (code === "INTEGRITY_VERIFIER_FAILED") {
    return failure("SOURCE_INTEGRITY_FAILED", "$integrityVerifier", message, code);
  }
  if (code === "INTEGRITY_VERIFICATION_FAILED") {
    return failure("SOURCE_INTEGRITY_FAILED", sourcePath(path), message, code);
  }
  return failure("INVALID_SOURCE", sourcePath(path), message, code);
}

export async function evaluateViraApplicationForAiHost(
  input: unknown,
  integrityVerifier: unknown,
): Promise<ViraApplicationAiHostResult> {
  const json = parseJsonValue(input);
  if (!json.ok) return failure("INVALID_INPUT", json.issue.path, json.issue.reason);
  const root = asObject(json.value);
  if (!root) return failure("INVALID_INPUT", "$", "AI-host evaluation input must be an exact object");

  const unknown = firstUnknownField(root, ROOT_FIELDS);
  if (unknown) return failure("UNKNOWN_FIELD", `$.${unknown}`, "unknown AI-host evaluation field");
  if (!("source" in root)) return failure("INVALID_SOURCE", "$.source", "source distribution envelope is required");
  if (!("host" in root)) return failure("INVALID_HOST", "$.host", "host descriptor is required");

  const host = parseHost(root.host);
  if (!host.ok) return host;
  if (typeof integrityVerifier !== "function") {
    return failure("INVALID_INTEGRITY_VERIFIER", "$integrityVerifier", "integrity verifier must be a function");
  }

  const verified = await verifyViraApplicationDistributionIntegrity(
    root.source,
    integrityVerifier as ViraApplicationDistributionIntegrityVerifier,
  );
  if (!verified.ok) {
    return mapDistributionFailure(verified.issue.code, verified.issue.path, verified.issue.message);
  }

  const compatibility = verified.value.application.hostCompatibility;
  if (compareRelease(host.value.viraVersion, compatibility.minViraVersion) < 0) {
    return failure(
      "HOST_VERSION_UNSUPPORTED",
      "$.host.viraVersion",
      `host viraVersion must be at least ${compatibility.minViraVersion}`,
    );
  }
  if (
    compatibility.maxViraVersion !== undefined
    && compareRelease(host.value.viraVersion, compatibility.maxViraVersion) > 0
  ) {
    return failure(
      "HOST_VERSION_UNSUPPORTED",
      "$.host.viraVersion",
      `host viraVersion must not exceed ${compatibility.maxViraVersion}`,
    );
  }

  const hostCapabilities = new Set(host.value.capabilities);
  for (const required of compatibility.requiredCapabilities) {
    if (!hostCapabilities.has(required)) {
      return failure(
        "MISSING_HOST_CAPABILITY",
        "$.host.capabilities",
        `host is missing required capability ${required}`,
      );
    }
  }

  const hostProjectionKeys = new Set(host.value.protocolProjections.map(refKey));
  const compatibleProtocolProjections = verified.value.application.protocolProjections
    .filter((ref) => hostProjectionKeys.has(refKey(ref)))
    .slice()
    .sort((left, right) => refKey(left).localeCompare(refKey(right)));

  return {
    ok: true,
    value: Object.freeze({
      sdkVersion: VIRA_APPLICATION_AI_HOST_SDK_VERSION,
      source: verified.value,
      host: host.value,
      compatibleProtocolProjections: Object.freeze(compatibleProtocolProjections),
    }),
  };
}
