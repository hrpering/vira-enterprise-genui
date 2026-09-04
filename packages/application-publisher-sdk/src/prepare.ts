import {
  VIRA_APPLICATION_DISTRIBUTION_INTEGRITY_ALGORITHM,
  VIRA_APPLICATION_DISTRIBUTION_SCHEMA_VERSION,
  parseViraApplicationDistributionEnvelope,
  serializeViraApplicationDistributionEnvelope,
} from "@vira-enterprise-genui/application-distribution";
import {
  parseViraApplicationPackage,
  serializeViraApplicationPackage,
} from "@vira-enterprise-genui/application-package";
import { parseJsonValue } from "@vira-enterprise-genui/protocol";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import { VIRA_APPLICATION_PUBLISHER_SDK_VERSION } from "./types.js";
import type {
  ViraApplicationPublisherDigestProvider,
  ViraApplicationPublisherIssue,
  ViraApplicationPublisherIssueCode,
  ViraApplicationPublisherPrepareResult,
} from "./types.js";

const ROOT_FIELDS = new Set(["publisherId", "application"]);
const SHA256_HEX = /^[0-9a-f]{64}$/;
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

type Failure = { readonly ok: false; readonly issue: ViraApplicationPublisherIssue };

function failure(
  code: ViraApplicationPublisherIssueCode,
  path: string,
  message: string,
  details?: Pick<ViraApplicationPublisherIssue, "applicationCode" | "distributionCode">,
): Failure {
  return {
    ok: false,
    issue: Object.freeze({
      code,
      path,
      message,
      ...(details?.applicationCode === undefined ? {} : { applicationCode: details.applicationCode }),
      ...(details?.distributionCode === undefined ? {} : { distributionCode: details.distributionCode }),
    }),
  };
}

function asObject(value: JsonValue | undefined): JsonObject | null {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

function firstUnknownField(object: JsonObject): string | null {
  for (const key of Object.keys(object)) {
    if (!ROOT_FIELDS.has(key)) return key;
  }
  return null;
}

function validPublisherId(value: JsonValue | undefined): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 200
    && value.trim() === value
    && !CONTROL_CHARS.test(value);
}

function applicationPath(path: string): string {
  if (path === "$" || path.length === 0) return "$.application";
  return `$.application${path.startsWith("$") ? path.slice(1) : `.${path}`}`;
}

export async function prepareViraApplicationDistribution(
  input: unknown,
  digestProvider: unknown,
): Promise<ViraApplicationPublisherPrepareResult> {
  const json = parseJsonValue(input);
  if (!json.ok) return failure("INVALID_INPUT", json.issue.path, json.issue.reason);
  const root = asObject(json.value);
  if (!root) return failure("INVALID_INPUT", "$", "publisher preparation input must be an exact object");

  const unknown = firstUnknownField(root);
  if (unknown) return failure("UNKNOWN_FIELD", `$.${unknown}`, "unknown publisher preparation field");
  if (!("publisherId" in root)) return failure("INVALID_PUBLISHER_ID", "$.publisherId", "publisherId is required");
  if (!("application" in root)) return failure("INVALID_APPLICATION", "$.application", "application is required");

  const publisherId = root.publisherId;
  if (!validPublisherId(publisherId)) {
    return failure("INVALID_PUBLISHER_ID", "$.publisherId", "publisherId must be bounded safe exact text");
  }

  const application = parseViraApplicationPackage(root.application);
  if (!application.ok) {
    return failure(
      "INVALID_APPLICATION",
      applicationPath(application.issue.path),
      application.issue.message,
      { applicationCode: application.issue.code },
    );
  }

  if (application.value.publisher.id !== publisherId) {
    return failure(
      "PUBLISHER_MISMATCH",
      "$.publisherId",
      "host-asserted publisherId must exactly match the canonical Application publisher id",
    );
  }

  if (typeof digestProvider !== "function") {
    return failure("INVALID_DIGEST_PROVIDER", "$digestProvider", "digest provider must be a function");
  }

  const serializedApplication = serializeViraApplicationPackage(application.value);
  if (!serializedApplication.ok) {
    return failure(
      "INVALID_APPLICATION",
      applicationPath(serializedApplication.issue.path),
      serializedApplication.issue.message,
      { applicationCode: serializedApplication.issue.code },
    );
  }

  let digest: unknown;
  try {
    digest = await (digestProvider as ViraApplicationPublisherDigestProvider)(Object.freeze({
      algorithm: VIRA_APPLICATION_DISTRIBUTION_INTEGRITY_ALGORITHM,
      canonicalArtifact: serializedApplication.value,
      applicationId: application.value.identity.id,
      applicationVersion: application.value.version,
      publisherId: application.value.publisher.id,
    }));
  } catch {
    return failure("DIGEST_PROVIDER_FAILED", "$digestProvider", "digest provider failed closed");
  }

  if (typeof digest !== "string" || !SHA256_HEX.test(digest)) {
    return failure("INVALID_DIGEST", "$digestProvider", "digest provider must return exactly one lowercase sha256 hex digest");
  }

  const envelope = parseViraApplicationDistributionEnvelope({
    schemaVersion: VIRA_APPLICATION_DISTRIBUTION_SCHEMA_VERSION,
    application: application.value,
    integrity: {
      algorithm: VIRA_APPLICATION_DISTRIBUTION_INTEGRITY_ALGORITHM,
      digest,
    },
  });
  if (!envelope.ok) {
    return failure(
      "INVALID_DISTRIBUTION",
      envelope.issue.path,
      envelope.issue.message,
      { distributionCode: envelope.issue.code },
    );
  }

  const serializedEnvelope = serializeViraApplicationDistributionEnvelope(envelope.value);
  if (!serializedEnvelope.ok) {
    return failure(
      "INVALID_DISTRIBUTION",
      serializedEnvelope.issue.path,
      serializedEnvelope.issue.message,
      { distributionCode: serializedEnvelope.issue.code },
    );
  }

  return {
    ok: true,
    value: Object.freeze({
      sdkVersion: VIRA_APPLICATION_PUBLISHER_SDK_VERSION,
      publisherId: application.value.publisher.id,
      envelope: envelope.value,
      serializedEnvelope: serializedEnvelope.value,
    }),
  };
}
