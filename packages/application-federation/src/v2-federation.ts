import {
  parseViraApplicationDistributionEnvelopeV2,
  type ViraApplicationDistributionEnvelopeV2,
} from "@vira-enterprise-genui/application-distribution";
import {
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import {
  lookupViraFederatedApplication,
  parseViraApplicationFederationSnapshot,
} from "./federation.js";
import type {
  ViraApplicationFederationIssueCode,
} from "./types.js";
import {
  VIRA_APPLICATION_FEDERATION_V2_SCHEMA_VERSION,
  type ViraApplicationFederationSnapshotV2,
  type ViraApplicationFederationSourceV2,
  type ViraApplicationFederationV2Issue,
  type ViraApplicationFederationV2Result,
  type ViraApplicationFederationV2SerializationResult,
  type ViraFederatedApplicationLookupV2Result,
} from "./v2-types.js";

type Failure = { readonly ok: false; readonly issue: ViraApplicationFederationV2Issue };

function failure(code: ViraApplicationFederationIssueCode, path: string, message: string): Failure {
  return { ok: false, issue: Object.freeze({ code, path, message }) };
}

function object(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function shape(value: JsonObject, allowed: readonly string[], required = allowed): string | undefined {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).sort().find((key) => !allowedKeys.has(key))
    ?? required.find((key) => !Object.hasOwn(value, key));
}

function projectApplicationV1(application: ViraApplicationDistributionEnvelopeV2["application"]): unknown {
  return {
    schemaVersion: "1",
    identity: application.identity,
    version: application.version,
    publisher: application.publisher,
    experiences: application.experiences,
    capabilities: application.capabilities,
    contextTypes: application.contextTypes,
    actions: application.actions.map((ref) => ({ actionType: ref.id })),
    flows: application.flows,
    brandRef: application.brandRef,
    governanceRequirements: application.governanceRequirements,
    hostCompatibility: application.hostCompatibility,
    protocolProjections: application.protocolProjections,
    distribution: application.distribution,
    commercial: {
      entitlementRefs: application.commercial.entitlementRefs,
      meteringRefs: application.commercial.meteringRefs,
    },
  };
}

function projectEnvelopeV1(envelope: ViraApplicationDistributionEnvelopeV2): unknown {
  return {
    schemaVersion: "1",
    application: projectApplicationV1(envelope.application),
    integrity: envelope.integrity,
  };
}

function projectSnapshotV1(snapshot: ViraApplicationFederationSnapshotV2): unknown {
  return {
    schemaVersion: "1",
    sources: snapshot.sources.map((source) => ({
      sourceId: source.sourceId,
      applications: source.applications.map(projectEnvelopeV1),
    })),
  };
}

function applicationKey(envelope: ViraApplicationDistributionEnvelopeV2): string {
  return `${envelope.application.identity.id}\u0000${envelope.application.version}`;
}

export function parseViraApplicationFederationSnapshotV2(input: unknown): ViraApplicationFederationV2Result {
  const parsed = parseJsonValue(input, "$");
  if (!parsed.ok || !object(parsed.value)) {
    return failure(
      "INVALID_INPUT",
      parsed.ok ? "$" : parsed.issue.path,
      parsed.ok ? "federation V2 snapshot must be an exact object" : parsed.issue.reason,
    );
  }
  const root = parsed.value;
  const rootUnexpected = shape(root, ["schemaVersion", "sources"]);
  if (rootUnexpected) return failure("UNKNOWN_FIELD", `$.${rootUnexpected}`, "federation V2 snapshot shape is invalid");
  if (root.schemaVersion !== VIRA_APPLICATION_FEDERATION_V2_SCHEMA_VERSION) {
    return failure(
      "INVALID_SCHEMA_VERSION",
      "$.schemaVersion",
      `schemaVersion must equal ${VIRA_APPLICATION_FEDERATION_V2_SCHEMA_VERSION}`,
    );
  }
  if (!Array.isArray(root.sources)) return failure("INVALID_SOURCE", "$.sources", "federation sources must be an array");

  const sources: ViraApplicationFederationSourceV2[] = [];
  for (let sourceIndex = 0; sourceIndex < root.sources.length; sourceIndex += 1) {
    const path = `$.sources[${sourceIndex}]`;
    const source = root.sources[sourceIndex] as JsonValue;
    if (!object(source)) return failure("INVALID_SOURCE", path, "federation source must be an exact object");
    const sourceUnexpected = shape(source, ["sourceId", "applications"]);
    if (sourceUnexpected) return failure("INVALID_SOURCE", `${path}.${sourceUnexpected}`, "federation source shape is invalid");
    if (!Array.isArray(source.applications)) return failure("INVALID_SOURCE", `${path}.applications`, "source applications must be an array");

    const applications: ViraApplicationDistributionEnvelopeV2[] = [];
    for (let applicationIndex = 0; applicationIndex < source.applications.length; applicationIndex += 1) {
      const application = parseViraApplicationDistributionEnvelopeV2(source.applications[applicationIndex]);
      const applicationPath = `${path}.applications[${applicationIndex}]`;
      if (!application.ok) {
        const suffix = application.issue.path === "$" ? "" : application.issue.path.slice(1);
        return failure("INVALID_APPLICATION", `${applicationPath}${suffix}`, application.issue.message);
      }
      applications.push(application.value);
    }
    sources.push(Object.freeze({
      sourceId: source.sourceId as string,
      applications: Object.freeze(applications),
    }));
  }

  const projected = parseViraApplicationFederationSnapshot({
    schemaVersion: "1",
    sources: sources.map((source) => ({
      sourceId: source.sourceId,
      applications: source.applications.map(projectEnvelopeV1),
    })),
  });
  if (!projected.ok) return projected;

  const originals = new Map<string, ViraApplicationDistributionEnvelopeV2>();
  for (const source of sources) {
    for (const application of source.applications) {
      originals.set(`${source.sourceId}\u0000${applicationKey(application)}`, application);
    }
  }

  const canonicalSources: ViraApplicationFederationSourceV2[] = projected.value.sources.map((source) => {
    const applications = source.applications.map((application) => {
      const key = `${source.sourceId}\u0000${application.application.identity.id}\u0000${application.application.version}`;
      return originals.get(key)!;
    });
    return Object.freeze({ sourceId: source.sourceId, applications: Object.freeze(applications) });
  });

  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: VIRA_APPLICATION_FEDERATION_V2_SCHEMA_VERSION,
      sources: Object.freeze(canonicalSources),
    }),
  };
}

export function serializeViraApplicationFederationSnapshotV2(
  input: unknown,
): ViraApplicationFederationV2SerializationResult {
  const parsed = parseViraApplicationFederationSnapshotV2(input);
  if (!parsed.ok) return parsed;
  return { ok: true, value: JSON.stringify(parsed.value), snapshot: parsed.value };
}

export function lookupViraFederatedApplicationV2(
  input: unknown,
  query: unknown,
): ViraFederatedApplicationLookupV2Result {
  const parsed = parseViraApplicationFederationSnapshotV2(input);
  if (!parsed.ok) return parsed;
  const lookup = lookupViraFederatedApplication(projectSnapshotV1(parsed.value), query);
  if (!lookup.ok) return lookup;
  if (lookup.value.envelope === null) {
    return {
      ok: true,
      value: Object.freeze({
        applicationId: lookup.value.applicationId,
        applicationVersion: lookup.value.applicationVersion,
        envelope: null,
        sourceIds: lookup.value.sourceIds,
      }),
    };
  }
  let envelope: ViraApplicationDistributionEnvelopeV2 | null = null;
  for (const source of parsed.value.sources) {
    const match = source.applications.find((candidate) => (
      candidate.application.identity.id === lookup.value.applicationId
      && candidate.application.version === lookup.value.applicationVersion
    ));
    if (match) {
      envelope = match;
      break;
    }
  }
  if (!envelope) return failure("INVALID_APPLICATION", "$", "validated V2 federation lookup lost its canonical envelope");
  return {
    ok: true,
    value: Object.freeze({
      applicationId: lookup.value.applicationId,
      applicationVersion: lookup.value.applicationVersion,
      envelope,
      sourceIds: lookup.value.sourceIds,
    }),
  };
}
