import {
  VIRA_ENTERPRISE_CONTEXT_VERSION,
  VIRA_ENTERPRISE_ENVIRONMENTS,
  type ViraEnterpriseEnvironmentName,
  type ViraEnterpriseScope,
} from "@vira-enterprise-genui/enterprise-context";
import {
  isSemanticNamespace,
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import {
  VIRA_ARTIFACT_CLASSIFICATIONS,
  VIRA_ARTIFACT_MAX_LINEAGE,
  VIRA_ARTIFACT_PRODUCER_KINDS,
  VIRA_ARTIFACT_RETENTION_MODES,
  VIRA_ARTIFACT_SCHEMA_VERSION,
  VIRA_ARTIFACT_SOURCE_KINDS,
  type ViraArtifactClassification,
  type ViraArtifactMetadata,
  type ViraArtifactProducer,
  type ViraArtifactProducerKind,
  type ViraArtifactResult,
  type ViraArtifactRetention,
  type ViraArtifactRetentionMode,
  type ViraArtifactRevisionReference,
  type ViraArtifactSerializationResult,
  type ViraArtifactSource,
  type ViraArtifactSourceKind,
  type ViraArtifactValidationCode,
  type ViraArtifactValidationIssue,
} from "./types.js";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ENTERPRISE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const PRODUCER_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/;
const LOGICAL_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,511}$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const MEDIA_TYPE = /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,63}\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,63}$/;
const CLASSIFICATIONS = new Set<string>(VIRA_ARTIFACT_CLASSIFICATIONS);
const PRODUCER_KINDS = new Set<string>(VIRA_ARTIFACT_PRODUCER_KINDS);
const SOURCE_KINDS = new Set<string>(VIRA_ARTIFACT_SOURCE_KINDS);
const RETENTION_MODES = new Set<string>(VIRA_ARTIFACT_RETENTION_MODES);

type Failure = { readonly ok: false; readonly issue: ViraArtifactValidationIssue };
type Parsed<T> = { readonly ok: true; readonly value: T } | Failure;

function fail(code: ViraArtifactValidationCode, path: string, message: string): Failure {
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

function positiveRevision(value: JsonValue | undefined): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function nonNegativeInteger(value: JsonValue | undefined): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseScope(value: JsonValue | undefined): Parsed<ViraEnterpriseScope> {
  if (!object(value)) return fail("INVALID_SCOPE", "$.scope", "scope must be an exact enterprise scope object");
  const unexpected = shape(value, ["version", "organizationId", "projectId", "environment"]);
  if (unexpected) return fail("INVALID_SCOPE", `$.scope.${unexpected}`, "scope shape is invalid");
  if (value.version !== VIRA_ENTERPRISE_CONTEXT_VERSION) {
    return fail("INVALID_SCOPE", "$.scope.version", "scope version is invalid");
  }
  if (typeof value.organizationId !== "string" || !ENTERPRISE_ID.test(value.organizationId)) {
    return fail("INVALID_SCOPE", "$.scope.organizationId", "organizationId is invalid");
  }
  if (typeof value.projectId !== "string" || !ENTERPRISE_ID.test(value.projectId)) {
    return fail("INVALID_SCOPE", "$.scope.projectId", "projectId is invalid");
  }
  if (
    typeof value.environment !== "string"
    || !VIRA_ENTERPRISE_ENVIRONMENTS.includes(value.environment as ViraEnterpriseEnvironmentName)
  ) {
    return fail("INVALID_SCOPE", "$.scope.environment", "environment is invalid");
  }
  return {
    ok: true,
    value: Object.freeze({
      version: VIRA_ENTERPRISE_CONTEXT_VERSION,
      organizationId: value.organizationId,
      projectId: value.projectId,
      environment: value.environment as ViraEnterpriseEnvironmentName,
    }),
  };
}

function parseProducer(value: JsonValue | undefined): Parsed<ViraArtifactProducer> {
  if (!object(value)) return fail("INVALID_PRODUCER", "$.producer", "producer must be an exact object");
  const unexpected = shape(value, ["kind", "id", "revision"]);
  if (unexpected) return fail("INVALID_PRODUCER", `$.producer.${unexpected}`, "producer shape is invalid");
  if (typeof value.kind !== "string" || !PRODUCER_KINDS.has(value.kind)) {
    return fail("INVALID_PRODUCER", "$.producer.kind", "producer kind is invalid");
  }
  if (typeof value.id !== "string" || !PRODUCER_ID.test(value.id)) {
    return fail("INVALID_PRODUCER", "$.producer.id", "producer id is invalid");
  }
  if (value.revision !== null && !positiveRevision(value.revision)) {
    return fail("INVALID_PRODUCER", "$.producer.revision", "producer revision must be null or a positive safe integer");
  }
  return {
    ok: true,
    value: Object.freeze({
      kind: value.kind as ViraArtifactProducerKind,
      id: value.id,
      revision: value.revision,
    }),
  };
}

function parseSource(value: JsonValue | undefined): Parsed<ViraArtifactSource> {
  if (!object(value)) return fail("INVALID_SOURCE", "$.source", "source must be an exact object");
  const unexpected = shape(value, ["kind", "reference"]);
  if (unexpected) return fail("INVALID_SOURCE", `$.source.${unexpected}`, "source shape is invalid");
  if (typeof value.kind !== "string" || !SOURCE_KINDS.has(value.kind)) {
    return fail("INVALID_SOURCE", "$.source.kind", "source kind is invalid");
  }
  if (value.reference !== null && (typeof value.reference !== "string" || !LOGICAL_REFERENCE.test(value.reference))) {
    return fail("INVALID_SOURCE", "$.source.reference", "source reference must be null or a bounded logical reference");
  }
  return {
    ok: true,
    value: Object.freeze({ kind: value.kind as ViraArtifactSourceKind, reference: value.reference }),
  };
}

function parseLineageReference(value: JsonValue, index: number): Parsed<ViraArtifactRevisionReference> {
  const path = `$.lineage[${index}]`;
  if (!object(value)) return fail("INVALID_LINEAGE", path, "lineage entry must be an exact object");
  const unexpected = shape(value, ["id", "revision", "digest"]);
  if (unexpected) return fail("INVALID_LINEAGE", `${path}.${unexpected}`, "lineage entry shape is invalid");
  if (typeof value.id !== "string" || !ID.test(value.id)) {
    return fail("INVALID_LINEAGE", `${path}.id`, "lineage artifact id is invalid");
  }
  if (!positiveRevision(value.revision)) {
    return fail("INVALID_LINEAGE", `${path}.revision`, "lineage revision must be a positive safe integer");
  }
  if (typeof value.digest !== "string" || !SHA256.test(value.digest)) {
    return fail("INVALID_LINEAGE", `${path}.digest`, "lineage digest must be exact sha256");
  }
  return { ok: true, value: Object.freeze({ id: value.id, revision: value.revision, digest: value.digest }) };
}

function parseLineage(
  value: JsonValue | undefined,
  artifactId: string,
  artifactRevision: number,
): Parsed<readonly ViraArtifactRevisionReference[]> {
  if (!Array.isArray(value)) return fail("INVALID_LINEAGE", "$.lineage", "lineage must be an array");
  if (value.length > VIRA_ARTIFACT_MAX_LINEAGE) {
    return fail("LINEAGE_LIMIT_EXCEEDED", "$.lineage", `lineage limit is ${VIRA_ARTIFACT_MAX_LINEAGE}`);
  }
  const output: ViraArtifactRevisionReference[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const parsed = parseLineageReference(value[index] as JsonValue, index);
    if (!parsed.ok) return parsed;
    if (parsed.value.id === artifactId && parsed.value.revision === artifactRevision) {
      return fail("SELF_LINEAGE", `$.lineage[${index}]`, "artifact revision cannot include itself in lineage");
    }
    const key = `${parsed.value.id}:${parsed.value.revision}:${parsed.value.digest}`;
    if (seen.has(key)) {
      return fail("DUPLICATE_LINEAGE", `$.lineage[${index}]`, "duplicate exact lineage reference");
    }
    seen.add(key);
    output.push(parsed.value);
  }
  return { ok: true, value: Object.freeze(output) };
}

function parseRetention(value: JsonValue | undefined): Parsed<ViraArtifactRetention> {
  if (!object(value)) return fail("INVALID_RETENTION", "$.retention", "retention must be an exact object");
  const unexpected = shape(value, ["mode", "policyRef", "retainUntilUnixMs"]);
  if (unexpected) return fail("INVALID_RETENTION", `$.retention.${unexpected}`, "retention shape is invalid");
  if (typeof value.mode !== "string" || !RETENTION_MODES.has(value.mode)) {
    return fail("INVALID_RETENTION", "$.retention.mode", "retention mode is invalid");
  }
  const mode = value.mode as ViraArtifactRetentionMode;
  if (value.policyRef !== null && (typeof value.policyRef !== "string" || !isSemanticNamespace(value.policyRef))) {
    return fail("INVALID_RETENTION", "$.retention.policyRef", "policyRef must be null or a semantic namespace");
  }
  if (value.retainUntilUnixMs !== null && !nonNegativeInteger(value.retainUntilUnixMs)) {
    return fail("INVALID_RETENTION", "$.retention.retainUntilUnixMs", "retainUntilUnixMs must be null or non-negative safe integer");
  }
  if (mode === "policy" && value.policyRef === null) {
    return fail("INVALID_RETENTION", "$.retention.policyRef", "policy retention requires an exact policyRef");
  }
  if (mode !== "policy" && value.policyRef !== null) {
    return fail("INVALID_RETENTION", "$.retention.policyRef", "only policy retention may carry policyRef");
  }
  if ((mode === "legal-hold" || mode === "permanent") && value.retainUntilUnixMs !== null) {
    return fail("INVALID_RETENTION", "$.retention.retainUntilUnixMs", `${mode} retention cannot carry an expiry`);
  }
  return {
    ok: true,
    value: Object.freeze({ mode, policyRef: value.policyRef, retainUntilUnixMs: value.retainUntilUnixMs }),
  };
}

export function parseViraArtifactMetadata(input: unknown): ViraArtifactResult {
  const parsed = parseJsonValue(input);
  if (!parsed.ok) return fail("INVALID_TYPE", parsed.issue.path, parsed.issue.reason);
  if (!object(parsed.value)) return fail("INVALID_TYPE", "$", "artifact metadata must be an exact object");
  const root = parsed.value;
  const required = [
    "schemaVersion",
    "id",
    "revision",
    "scope",
    "digest",
    "mediaType",
    "byteLength",
    "producer",
    "source",
    "lineage",
    "classification",
    "retention",
    "createdAtUnixMs",
  ] as const;
  const unexpected = shape(root, required);
  if (unexpected) {
    const code = Object.hasOwn(root, unexpected) ? "UNKNOWN_FIELD" : "INVALID_TYPE";
    return fail(code, `$.${unexpected}`, "artifact metadata shape is invalid");
  }
  if (root.schemaVersion !== VIRA_ARTIFACT_SCHEMA_VERSION) {
    return fail("INVALID_SCHEMA_VERSION", "$.schemaVersion", "artifact schemaVersion is invalid");
  }
  if (typeof root.id !== "string" || !ID.test(root.id)) {
    return fail("INVALID_ID", "$.id", "artifact id is invalid");
  }
  if (!positiveRevision(root.revision)) {
    return fail("INVALID_REVISION", "$.revision", "artifact revision must be a positive safe integer");
  }
  const scope = parseScope(root.scope);
  if (!scope.ok) return scope;
  if (typeof root.digest !== "string" || !SHA256.test(root.digest)) {
    return fail("INVALID_DIGEST", "$.digest", "artifact digest must be exact lowercase sha256");
  }
  if (typeof root.mediaType !== "string" || !MEDIA_TYPE.test(root.mediaType)) {
    return fail("INVALID_MEDIA_TYPE", "$.mediaType", "artifact mediaType is invalid");
  }
  if (!nonNegativeInteger(root.byteLength)) {
    return fail("INVALID_BYTE_LENGTH", "$.byteLength", "artifact byteLength must be a non-negative safe integer");
  }
  const producer = parseProducer(root.producer);
  if (!producer.ok) return producer;
  const source = parseSource(root.source);
  if (!source.ok) return source;
  const lineage = parseLineage(root.lineage, root.id, root.revision);
  if (!lineage.ok) return lineage;
  if (source.value.kind === "derived" && lineage.value.length === 0) {
    return fail("INVALID_LINEAGE", "$.lineage", "derived artifact requires at least one exact lineage reference");
  }
  if (typeof root.classification !== "string" || !CLASSIFICATIONS.has(root.classification)) {
    return fail("INVALID_CLASSIFICATION", "$.classification", "artifact classification is invalid");
  }
  const retention = parseRetention(root.retention);
  if (!retention.ok) return retention;
  if (!nonNegativeInteger(root.createdAtUnixMs)) {
    return fail("INVALID_CREATED_AT", "$.createdAtUnixMs", "createdAtUnixMs must be a non-negative safe integer");
  }
  const artifact: ViraArtifactMetadata = Object.freeze({
    schemaVersion: VIRA_ARTIFACT_SCHEMA_VERSION,
    id: root.id,
    revision: root.revision,
    scope: scope.value,
    digest: root.digest,
    mediaType: root.mediaType,
    byteLength: root.byteLength,
    producer: producer.value,
    source: source.value,
    lineage: lineage.value,
    classification: root.classification as ViraArtifactClassification,
    retention: retention.value,
    createdAtUnixMs: root.createdAtUnixMs,
  });
  return { ok: true, value: artifact };
}

export function serializeViraArtifactMetadata(input: unknown): ViraArtifactSerializationResult {
  const parsed = parseViraArtifactMetadata(input);
  if (!parsed.ok) return parsed;
  return { ok: true, value: JSON.stringify(parsed.value), artifact: parsed.value };
}
