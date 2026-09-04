import {
  parseViraApplicationDistributionEnvelope,
  serializeViraApplicationDistributionEnvelope,
  type ViraApplicationDistributionEnvelope,
} from "@vira-enterprise-genui/application-distribution";
import {
  isSemanticNamespace,
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import {
  VIRA_APPLICATION_FEDERATION_MAX_APPLICATIONS_PER_SOURCE,
  VIRA_APPLICATION_FEDERATION_MAX_SOURCES,
  VIRA_APPLICATION_FEDERATION_MAX_TOTAL_APPLICATIONS,
  VIRA_APPLICATION_FEDERATION_SCHEMA_VERSION,
  type ViraApplicationFederationIssue,
  type ViraApplicationFederationIssueCode,
  type ViraApplicationFederationResult,
  type ViraApplicationFederationSerializationResult,
  type ViraApplicationFederationSource,
  type ViraFederatedApplicationLookupResult,
} from "./types.js";

const ROOT_FIELDS = new Set(["schemaVersion", "sources"]);
const SOURCE_FIELDS = new Set(["sourceId", "applications"]);
const QUERY_FIELDS = new Set(["applicationId", "applicationVersion"]);
const RELEASE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

type Failure = { readonly ok: false; readonly issue: ViraApplicationFederationIssue };

function failure(code: ViraApplicationFederationIssueCode, path: string, message: string): Failure {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function asObject(value: JsonValue | undefined): JsonObject | null {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

function firstUnknownField(object: JsonObject, allowed: ReadonlySet<string>): string | null {
  for (const key of Object.keys(object)) if (!allowed.has(key)) return key;
  return null;
}

function compareText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

function applicationKey(envelope: ViraApplicationDistributionEnvelope): string {
  return `${envelope.application.identity.id}\u0000${envelope.application.version}`;
}

function compareEnvelope(left: ViraApplicationDistributionEnvelope, right: ViraApplicationDistributionEnvelope): number {
  const id = compareText(left.application.identity.id, right.application.identity.id);
  if (id !== 0) return id;
  return compareText(left.application.version, right.application.version);
}

function serializeEnvelope(envelope: ViraApplicationDistributionEnvelope): string | null {
  const serialized = serializeViraApplicationDistributionEnvelope(envelope);
  return serialized.ok ? serialized.value : null;
}

export function parseViraApplicationFederationSnapshot(input: unknown): ViraApplicationFederationResult {
  const json = parseJsonValue(input);
  if (!json.ok) return failure("INVALID_INPUT", json.issue.path, json.issue.reason);
  const root = asObject(json.value);
  if (!root) return failure("INVALID_INPUT", "$", "federation snapshot must be an exact object");

  const rootUnknown = firstUnknownField(root, ROOT_FIELDS);
  if (rootUnknown) return failure("UNKNOWN_FIELD", `$.${rootUnknown}`, "unknown federation snapshot field");
  if (root.schemaVersion !== VIRA_APPLICATION_FEDERATION_SCHEMA_VERSION) {
    return failure("INVALID_SCHEMA_VERSION", "$.schemaVersion", `schemaVersion must be ${VIRA_APPLICATION_FEDERATION_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(root.sources)) return failure("INVALID_SOURCE", "$.sources", "sources must be an array");
  if (root.sources.length > VIRA_APPLICATION_FEDERATION_MAX_SOURCES) {
    return failure("SOURCE_LIMIT_EXCEEDED", "$.sources", `source limit is ${VIRA_APPLICATION_FEDERATION_MAX_SOURCES}`);
  }

  const sourceIds = new Set<string>();
  const globalApplications = new Map<string, string>();
  const sources: ViraApplicationFederationSource[] = [];
  let totalApplications = 0;

  for (let sourceIndex = 0; sourceIndex < root.sources.length; sourceIndex += 1) {
    const path = `$.sources[${sourceIndex}]`;
    const sourceObject = asObject(root.sources[sourceIndex] as JsonValue);
    if (!sourceObject) return failure("INVALID_SOURCE", path, "source must be an exact object");
    const unknown = firstUnknownField(sourceObject, SOURCE_FIELDS);
    if (unknown) return failure("UNKNOWN_FIELD", `${path}.${unknown}`, "unknown federation source field");
    if (typeof sourceObject.sourceId !== "string" || !isSemanticNamespace(sourceObject.sourceId)) {
      return failure("INVALID_SOURCE", `${path}.sourceId`, "sourceId must be a canonical semantic namespace");
    }
    const sourceId = sourceObject.sourceId;
    if (sourceIds.has(sourceId)) return failure("DUPLICATE_SOURCE", `${path}.sourceId`, "duplicate federation sourceId");
    sourceIds.add(sourceId);

    if (!Array.isArray(sourceObject.applications)) {
      return failure("INVALID_SOURCE", `${path}.applications`, "applications must be an array");
    }
    if (sourceObject.applications.length > VIRA_APPLICATION_FEDERATION_MAX_APPLICATIONS_PER_SOURCE) {
      return failure(
        "APPLICATION_LIMIT_EXCEEDED",
        `${path}.applications`,
        `applications-per-source limit is ${VIRA_APPLICATION_FEDERATION_MAX_APPLICATIONS_PER_SOURCE}`,
      );
    }
    totalApplications += sourceObject.applications.length;
    if (totalApplications > VIRA_APPLICATION_FEDERATION_MAX_TOTAL_APPLICATIONS) {
      return failure(
        "APPLICATION_LIMIT_EXCEEDED",
        "$.sources",
        `total federation application limit is ${VIRA_APPLICATION_FEDERATION_MAX_TOTAL_APPLICATIONS}`,
      );
    }

    const localApplications = new Set<string>();
    const applications: ViraApplicationDistributionEnvelope[] = [];
    for (let applicationIndex = 0; applicationIndex < sourceObject.applications.length; applicationIndex += 1) {
      const applicationPath = `${path}.applications[${applicationIndex}]`;
      const parsed = parseViraApplicationDistributionEnvelope(sourceObject.applications[applicationIndex]);
      if (!parsed.ok) {
        return failure("INVALID_APPLICATION", applicationPath, `invalid distribution envelope: ${parsed.issue.code}`);
      }
      if (
        parsed.value.application.distribution.visibility !== "public"
        || parsed.value.application.distribution.discoverable !== true
      ) {
        return failure(
          "NON_PUBLIC_APPLICATION",
          applicationPath,
          "federation sources may contain only public discoverable Application releases",
        );
      }

      const key = applicationKey(parsed.value);
      if (localApplications.has(key)) {
        return failure("DUPLICATE_APPLICATION", applicationPath, "duplicate exact Application release within federation source");
      }
      localApplications.add(key);

      const serialized = serializeEnvelope(parsed.value);
      if (serialized === null) return failure("INVALID_APPLICATION", applicationPath, "distribution envelope serialization failed");
      const existing = globalApplications.get(key);
      if (existing !== undefined && existing !== serialized) {
        return failure(
          "FEDERATION_CONFLICT",
          applicationPath,
          "federation sources disagree on the same exact Application id and version",
        );
      }
      globalApplications.set(key, serialized);
      applications.push(parsed.value);
    }

    applications.sort(compareEnvelope);
    sources.push(Object.freeze({ sourceId, applications: Object.freeze(applications) }));
  }

  sources.sort((left, right) => compareText(left.sourceId, right.sourceId));
  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: VIRA_APPLICATION_FEDERATION_SCHEMA_VERSION,
      sources: Object.freeze(sources),
    }),
  };
}

export function serializeViraApplicationFederationSnapshot(input: unknown): ViraApplicationFederationSerializationResult {
  const parsed = parseViraApplicationFederationSnapshot(input);
  if (!parsed.ok) return parsed;

  const serializedSources: string[] = [];
  for (const source of parsed.value.sources) {
    const applications: string[] = [];
    for (const envelope of source.applications) {
      const serialized = serializeEnvelope(envelope);
      if (serialized === null) return failure("INVALID_APPLICATION", "$.sources", "distribution envelope serialization failed");
      applications.push(serialized);
    }
    serializedSources.push(`{"sourceId":${JSON.stringify(source.sourceId)},"applications":[${applications.join(",")}]}`);
  }
  return {
    ok: true,
    value: `{"schemaVersion":"${VIRA_APPLICATION_FEDERATION_SCHEMA_VERSION}","sources":[${serializedSources.join(",")}]}`,
    snapshot: parsed.value,
  };
}

export function lookupViraFederatedApplication(
  snapshotInput: unknown,
  queryInput: unknown,
): ViraFederatedApplicationLookupResult {
  const snapshot = parseViraApplicationFederationSnapshot(snapshotInput);
  if (!snapshot.ok) return snapshot;

  const queryJson = parseJsonValue(queryInput);
  if (!queryJson.ok) return failure("INVALID_QUERY", queryJson.issue.path, queryJson.issue.reason);
  const query = asObject(queryJson.value);
  if (!query) return failure("INVALID_QUERY", "$query", "query must be an exact object");
  const unknown = firstUnknownField(query, QUERY_FIELDS);
  if (unknown) return failure("INVALID_QUERY", `$query.${unknown}`, "unknown federation query field");
  if (typeof query.applicationId !== "string" || !isSemanticNamespace(query.applicationId)) {
    return failure("INVALID_QUERY", "$query.applicationId", "applicationId must be a canonical semantic namespace");
  }
  if (
    typeof query.applicationVersion !== "string"
    || query.applicationVersion.length > 64
    || !RELEASE_VERSION.test(query.applicationVersion)
  ) {
    return failure("INVALID_QUERY", "$query.applicationVersion", "applicationVersion must be an exact release semver");
  }
  const applicationId = query.applicationId;
  const applicationVersion = query.applicationVersion;

  const sourceIds: string[] = [];
  let envelope: ViraApplicationDistributionEnvelope | null = null;
  for (const source of snapshot.value.sources) {
    for (const candidate of source.applications) {
      if (
        candidate.application.identity.id === applicationId
        && candidate.application.version === applicationVersion
      ) {
        sourceIds.push(source.sourceId);
        envelope ??= candidate;
      }
    }
  }

  return {
    ok: true,
    value: Object.freeze({
      applicationId,
      applicationVersion,
      envelope,
      sourceIds: Object.freeze(sourceIds),
    }),
  };
}
