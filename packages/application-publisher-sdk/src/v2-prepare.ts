import {
  VIRA_APPLICATION_DISTRIBUTION_INTEGRITY_ALGORITHM,
  VIRA_APPLICATION_DISTRIBUTION_V2_SCHEMA_VERSION,
  parseViraApplicationDistributionEnvelopeV2,
  serializeViraApplicationDistributionEnvelopeV2,
} from "@vira-enterprise-genui/application-distribution";
import {
  parseViraApplicationPackageV2,
  serializeViraApplicationPackageV2,
} from "@vira-enterprise-genui/application-package";
import { parseJsonValue } from "@vira-enterprise-genui/protocol";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import {
  VIRA_APPLICATION_PUBLISHER_SDK_V2_VERSION,
  type ViraApplicationPublisherDigestProviderV2,
  type ViraApplicationPublisherPrepareV2Result,
  type ViraApplicationPublisherV2Issue,
  type ViraApplicationPublisherV2IssueCode,
} from "./v2-types.js";

const ROOT_FIELDS = new Set(["publisherId", "application"]);
const SHA256_HEX = /^[0-9a-f]{64}$/;

type Failure = { readonly ok: false; readonly issue: ViraApplicationPublisherV2Issue };

function fail(
  code: ViraApplicationPublisherV2IssueCode,
  path: string,
  message: string,
  details?: Pick<ViraApplicationPublisherV2Issue, "applicationCode" | "distributionCode">,
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

function object(value: JsonValue | undefined): JsonObject | null {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

function validPublisherId(value: JsonValue | undefined): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 200
    && value.trim() === value
    && !hasControlCharacters(value);
}

function nestedPath(base: string, child: string): string {
  return child === "$" ? base : `${base}${child.slice(1)}`;
}

export async function prepareViraApplicationDistributionV2(
  input: unknown,
  digestProvider: unknown,
): Promise<ViraApplicationPublisherPrepareV2Result> {
  const parsed = parseJsonValue(input, "$");
  if (!parsed.ok) return fail("INVALID_INPUT", parsed.issue.path, parsed.issue.reason);
  const root = object(parsed.value);
  if (!root) return fail("INVALID_INPUT", "$", "publisher V2 preparation input must be an exact object");
  for (const key of Object.keys(root)) {
    if (!ROOT_FIELDS.has(key)) return fail("UNKNOWN_FIELD", `$.${key}`, "unknown publisher V2 preparation field");
  }
  if (!Object.hasOwn(root, "publisherId")) return fail("INVALID_PUBLISHER_ID", "$.publisherId", "publisherId is required");
  if (!Object.hasOwn(root, "application")) return fail("INVALID_APPLICATION", "$.application", "application is required");
  if (!validPublisherId(root.publisherId)) {
    return fail("INVALID_PUBLISHER_ID", "$.publisherId", "publisherId must be bounded safe exact text");
  }

  const application = parseViraApplicationPackageV2(root.application);
  if (!application.ok) {
    return fail(
      "INVALID_APPLICATION",
      nestedPath("$.application", application.issue.path),
      application.issue.message,
      { applicationCode: application.issue.code },
    );
  }
  if (application.value.publisher.id !== root.publisherId) {
    return fail(
      "PUBLISHER_MISMATCH",
      "$.publisherId",
      "host-asserted publisherId must exactly match the canonical Application V2 publisher id",
    );
  }
  if (typeof digestProvider !== "function") {
    return fail("INVALID_DIGEST_PROVIDER", "$digestProvider", "digest provider must be a function");
  }

  const serializedApplication = serializeViraApplicationPackageV2(application.value);
  if (!serializedApplication.ok) {
    return fail(
      "INVALID_APPLICATION",
      nestedPath("$.application", serializedApplication.issue.path),
      serializedApplication.issue.message,
      { applicationCode: serializedApplication.issue.code },
    );
  }

  let digest: unknown;
  try {
    digest = await (digestProvider as ViraApplicationPublisherDigestProviderV2)(Object.freeze({
      algorithm: VIRA_APPLICATION_DISTRIBUTION_INTEGRITY_ALGORITHM,
      canonicalArtifact: serializedApplication.value,
      applicationId: application.value.identity.id,
      applicationVersion: application.value.version,
      publisherId: application.value.publisher.id,
    }));
  } catch {
    return fail("DIGEST_PROVIDER_FAILED", "$digestProvider", "digest provider failed closed");
  }
  if (typeof digest !== "string" || !SHA256_HEX.test(digest)) {
    return fail("INVALID_DIGEST", "$digestProvider", "digest provider must return exactly one lowercase sha256 hex digest");
  }

  const envelope = parseViraApplicationDistributionEnvelopeV2({
    schemaVersion: VIRA_APPLICATION_DISTRIBUTION_V2_SCHEMA_VERSION,
    application: application.value,
    integrity: {
      algorithm: VIRA_APPLICATION_DISTRIBUTION_INTEGRITY_ALGORITHM,
      digest,
    },
  });
  if (!envelope.ok) {
    return fail(
      "INVALID_DISTRIBUTION",
      envelope.issue.path,
      envelope.issue.message,
      { distributionCode: envelope.issue.code },
    );
  }
  const serializedEnvelope = serializeViraApplicationDistributionEnvelopeV2(envelope.value);
  if (!serializedEnvelope.ok) {
    return fail(
      "INVALID_DISTRIBUTION",
      serializedEnvelope.issue.path,
      serializedEnvelope.issue.message,
      { distributionCode: serializedEnvelope.issue.code },
    );
  }

  return {
    ok: true,
    value: Object.freeze({
      sdkVersion: VIRA_APPLICATION_PUBLISHER_SDK_V2_VERSION,
      publisherId: application.value.publisher.id,
      envelope: envelope.value,
      serializedEnvelope: serializedEnvelope.value,
    }),
  };
}
