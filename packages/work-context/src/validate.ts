import {
  isSemanticNamespace,
  isSemanticSegment,
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import {
  VIRA_WORK_CONTEXT_DEFINITION_SCHEMA_VERSION,
  VIRA_WORK_CONTEXT_DESCRIPTION_MAX_LENGTH,
  VIRA_WORK_CONTEXT_ITEM_KINDS,
  VIRA_WORK_CONTEXT_MAX_ID_LENGTH,
  VIRA_WORK_CONTEXT_MAX_ITEMS,
  VIRA_WORK_CONTEXT_MAX_PROVENANCE_REFS,
  VIRA_WORK_CONTEXT_NAME_MAX_LENGTH,
  VIRA_WORK_CONTEXT_PUBLISHER_NAME_MAX_LENGTH,
  VIRA_WORK_CONTEXT_SCHEMA_VERSION,
  type ViraWorkContext,
  type ViraWorkContextDefinition,
  type ViraWorkContextDefinitionResult,
  type ViraWorkContextDefinitionSerializationResult,
  type ViraWorkContextExactReference,
  type ViraWorkContextItem,
  type ViraWorkContextItemKind,
  type ViraWorkContextMetadata,
  type ViraWorkContextProvenance,
  type ViraWorkContextPublisher,
  type ViraWorkContextResult,
  type ViraWorkContextSerializationResult,
  type ViraWorkContextValidationCode,
  type ViraWorkContextValidationIssue,
} from "./types.js";

const RELEASE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const VERSION_REF = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/;
const CONTEXT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const FLOATING_ALIASES = new Set(["latest", "current", "stable", "head", "main", "next"]);
const ITEM_KINDS = new Set<string>(VIRA_WORK_CONTEXT_ITEM_KINDS);

type Failure = { readonly ok: false; readonly issue: ViraWorkContextValidationIssue };
type Parsed<T> = { readonly ok: true; readonly value: T } | Failure;

function fail(code: ViraWorkContextValidationCode, path: string, message: string): Failure {
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

function boundedText(value: JsonValue | undefined, maxLength: number): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maxLength
    && value.trim() === value;
}

function releaseVersion(value: JsonValue | undefined): value is string {
  return typeof value === "string" && value.length <= 64 && RELEASE_VERSION.test(value);
}

function exactVersionRef(value: JsonValue | undefined): value is string {
  if (typeof value !== "string" || !VERSION_REF.test(value)) return false;
  const normalized = value.toLowerCase();
  if (FLOATING_ALIASES.has(normalized)) return false;
  return !/(?:^|[._:+-])[xX](?:$|[._:+-])/.test(value)
    && !/\d[xX](?:$|[._:+-])/.test(value);
}

function canonicalize(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => canonicalize(item)));
  }
  const entries = Object.keys(value)
    .sort()
    .map((key) => [key, canonicalize(value[key] as JsonValue)] as const);
  return Object.freeze(Object.fromEntries(entries)) as JsonObject;
}

function freeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) freeze(item);
    return Object.freeze(value) as T;
  }
  for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  return Object.freeze(value);
}

function parsePublisher(value: JsonValue | undefined): Parsed<ViraWorkContextPublisher> {
  if (!object(value)) return fail("INVALID_PUBLISHER", "$.publisher", "publisher must be an exact object");
  const unexpected = shape(value, ["id", "name"]);
  if (unexpected) return fail("INVALID_PUBLISHER", `$.publisher.${unexpected}`, "publisher shape is invalid");
  if (typeof value.id !== "string" || !isSemanticSegment(value.id)) {
    return fail("INVALID_PUBLISHER", "$.publisher.id", "publisher id must be a canonical semantic segment");
  }
  if (!boundedText(value.name, VIRA_WORK_CONTEXT_PUBLISHER_NAME_MAX_LENGTH)) {
    return fail("INVALID_PUBLISHER", "$.publisher.name", "publisher name is invalid");
  }
  return { ok: true, value: Object.freeze({ id: value.id, name: value.name }) };
}

function parseMetadata(value: JsonValue | undefined): Parsed<ViraWorkContextMetadata> {
  if (!object(value)) return fail("INVALID_METADATA", "$.metadata", "metadata must be an exact object");
  const unexpected = shape(value, ["name", "description"], ["name"]);
  if (unexpected) return fail("INVALID_METADATA", `$.metadata.${unexpected}`, "metadata shape is invalid");
  if (!boundedText(value.name, VIRA_WORK_CONTEXT_NAME_MAX_LENGTH)) {
    return fail("INVALID_METADATA", "$.metadata.name", "context name is invalid");
  }
  const description = value.description;
  if (
    description !== undefined
    && (typeof description !== "string"
      || description.length > VIRA_WORK_CONTEXT_DESCRIPTION_MAX_LENGTH
      || description.trim() !== description)
  ) {
    return fail("INVALID_METADATA", "$.metadata.description", "context description is invalid");
  }
  return {
    ok: true,
    value: Object.freeze({
      name: value.name,
      ...(description === undefined ? {} : { description }),
    }),
  };
}

function parseExactReference(value: JsonValue, path: string): Parsed<ViraWorkContextExactReference> {
  if (!object(value)) return fail("INVALID_REFERENCE", path, "reference must be an exact object");
  const unexpected = shape(value, ["id", "versionRef"]);
  if (unexpected) return fail("INVALID_REFERENCE", `${path}.${unexpected}`, "reference shape is invalid");
  if (typeof value.id !== "string" || !isSemanticNamespace(value.id)) {
    return fail("INVALID_REFERENCE", `${path}.id`, "reference id must be a canonical semantic namespace");
  }
  if (!exactVersionRef(value.versionRef)) {
    const code = typeof value.versionRef === "string" && VERSION_REF.test(value.versionRef)
      ? "FLOATING_REFERENCE"
      : "INVALID_REFERENCE";
    return fail(code, `${path}.versionRef`, "reference version must be exact and must not float");
  }
  return { ok: true, value: Object.freeze({ id: value.id, versionRef: value.versionRef }) };
}

function parseNullableReference(value: JsonValue | undefined, path: string): Parsed<ViraWorkContextExactReference | null> {
  if (value === null) return { ok: true, value: null };
  return parseExactReference(value as JsonValue, path);
}

function parseSourceRefs(value: JsonValue | undefined, path: string): Parsed<readonly ViraWorkContextExactReference[]> {
  if (!Array.isArray(value)) {
    return fail("INVALID_PROVENANCE", path, "sourceRefs must be an array");
  }
  if (value.length > VIRA_WORK_CONTEXT_MAX_PROVENANCE_REFS) {
    return fail(
      "PROVENANCE_LIMIT_EXCEEDED",
      path,
      `provenance reference limit is ${VIRA_WORK_CONTEXT_MAX_PROVENANCE_REFS}`,
    );
  }
  const output: ViraWorkContextExactReference[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const parsed = parseExactReference(value[index] as JsonValue, `${path}[${index}]`);
    if (!parsed.ok) return parsed;
    const key = `${parsed.value.id}\u0000${parsed.value.versionRef}`;
    if (seen.has(key)) {
      return fail(
        "DUPLICATE_PROVENANCE_REFERENCE",
        `${path}[${index}]`,
        "duplicate provenance source reference",
      );
    }
    seen.add(key);
    output.push(parsed.value);
  }
  return { ok: true, value: Object.freeze(output) };
}

function parseProvenance(value: JsonValue | undefined, path: string): Parsed<ViraWorkContextProvenance> {
  if (!object(value)) return fail("INVALID_PROVENANCE", path, "provenance must be an exact object");
  const unexpected = shape(value, ["sourceRefs", "observedAtUnixMs"]);
  if (unexpected) return fail("INVALID_PROVENANCE", `${path}.${unexpected}`, "provenance shape is invalid");
  const sourceRefs = parseSourceRefs(value.sourceRefs, `${path}.sourceRefs`);
  if (!sourceRefs.ok) return sourceRefs;
  const observedAtUnixMs = value.observedAtUnixMs;
  if (
    observedAtUnixMs !== null
    && (typeof observedAtUnixMs !== "number"
      || !Number.isSafeInteger(observedAtUnixMs)
      || observedAtUnixMs < 0)
  ) {
    return fail("INVALID_PROVENANCE", `${path}.observedAtUnixMs`, "observedAtUnixMs must be null or a non-negative safe integer");
  }
  return {
    ok: true,
    value: Object.freeze({ sourceRefs: sourceRefs.value, observedAtUnixMs }),
  };
}

function parseItem(value: JsonValue, index: number): Parsed<ViraWorkContextItem> {
  const path = `$.items[${index}]`;
  if (!object(value)) return fail("INVALID_ITEM", path, "item must be an exact object");
  const unexpected = shape(value, ["id", "kind", "typeRef", "value", "provenance"]);
  if (unexpected) return fail("INVALID_ITEM", `${path}.${unexpected}`, "item shape is invalid");
  if (typeof value.id !== "string" || !isSemanticSegment(value.id)) {
    return fail("INVALID_ITEM", `${path}.id`, "item id must be a canonical semantic segment");
  }
  if (typeof value.kind !== "string" || !ITEM_KINDS.has(value.kind)) {
    return fail("INVALID_ITEM_KIND", `${path}.kind`, "item kind is not a WorkContext semantic kind");
  }
  const typeRef = parseNullableReference(value.typeRef, `${path}.typeRef`);
  if (!typeRef.ok) return typeRef;
  const provenance = parseProvenance(value.provenance, `${path}.provenance`);
  if (!provenance.ok) return provenance;
  return {
    ok: true,
    value: freeze({
      id: value.id,
      kind: value.kind as ViraWorkContextItemKind,
      typeRef: typeRef.value,
      value: canonicalize(value.value as JsonValue),
      provenance: provenance.value,
    }),
  };
}

function parseItems(value: JsonValue | undefined): Parsed<readonly ViraWorkContextItem[]> {
  if (!Array.isArray(value)) return fail("INVALID_ITEMS", "$.items", "items must be an array");
  if (value.length > VIRA_WORK_CONTEXT_MAX_ITEMS) {
    return fail("ITEM_LIMIT_EXCEEDED", "$.items", `item limit is ${VIRA_WORK_CONTEXT_MAX_ITEMS}`);
  }
  const output: ViraWorkContextItem[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const parsed = parseItem(value[index] as JsonValue, index);
    if (!parsed.ok) return parsed;
    if (seen.has(parsed.value.id)) {
      return fail("DUPLICATE_ITEM", `$.items[${index}].id`, "duplicate WorkContext item id");
    }
    seen.add(parsed.value.id);
    output.push(parsed.value);
  }
  return { ok: true, value: Object.freeze(output) };
}

function parseRoot(input: unknown): Parsed<JsonObject> {
  const parsed = parseJsonValue(input, "$");
  if (!parsed.ok || !object(parsed.value)) {
    return fail(
      "INVALID_TYPE",
      parsed.ok ? "$" : parsed.issue.path,
      parsed.ok ? "WorkContext payload must be a plain object" : parsed.issue.reason,
    );
  }
  return { ok: true, value: parsed.value };
}

export function parseViraWorkContextDefinition(input: unknown): ViraWorkContextDefinitionResult {
  const parsedRoot = parseRoot(input);
  if (!parsedRoot.ok) return parsedRoot;
  const root = parsedRoot.value;
  const unexpected = shape(root, ["schemaVersion", "id", "version", "publisher", "metadata"]);
  if (unexpected) return fail("UNKNOWN_FIELD", `$.${unexpected}`, `unknown or missing context definition field: ${unexpected}`);
  if (root.schemaVersion !== VIRA_WORK_CONTEXT_DEFINITION_SCHEMA_VERSION) {
    return fail(
      "INVALID_SCHEMA_VERSION",
      "$.schemaVersion",
      `schemaVersion must equal ${VIRA_WORK_CONTEXT_DEFINITION_SCHEMA_VERSION}`,
    );
  }
  if (typeof root.id !== "string" || !isSemanticNamespace(root.id) || !root.id.includes(".")) {
    return fail("INVALID_ID", "$.id", "WorkContext definition id must be a namespaced semantic identity");
  }
  if (!releaseVersion(root.version)) {
    return fail("INVALID_VERSION", "$.version", "WorkContext definition release version must be semver");
  }
  const publisher = parsePublisher(root.publisher);
  if (!publisher.ok) return publisher;
  if (root.id.split(".")[0] !== publisher.value.id) {
    return fail("INVALID_PUBLISHER", "$.publisher.id", "publisher id must match WorkContext identity namespace");
  }
  const metadata = parseMetadata(root.metadata);
  if (!metadata.ok) return metadata;
  const value: ViraWorkContextDefinition = {
    schemaVersion: VIRA_WORK_CONTEXT_DEFINITION_SCHEMA_VERSION,
    id: root.id,
    version: root.version,
    publisher: publisher.value,
    metadata: metadata.value,
  };
  return { ok: true, value: freeze(value) };
}

export function parseViraWorkContext(input: unknown): ViraWorkContextResult {
  const parsedRoot = parseRoot(input);
  if (!parsedRoot.ok) return parsedRoot;
  const root = parsedRoot.value;
  const unexpected = shape(root, ["schemaVersion", "id", "typeRef", "items"]);
  if (unexpected) return fail("UNKNOWN_FIELD", `$.${unexpected}`, `unknown or missing WorkContext field: ${unexpected}`);
  if (root.schemaVersion !== VIRA_WORK_CONTEXT_SCHEMA_VERSION) {
    return fail(
      "INVALID_SCHEMA_VERSION",
      "$.schemaVersion",
      `schemaVersion must equal ${VIRA_WORK_CONTEXT_SCHEMA_VERSION}`,
    );
  }
  if (
    typeof root.id !== "string"
    || root.id.length > VIRA_WORK_CONTEXT_MAX_ID_LENGTH
    || !CONTEXT_ID.test(root.id)
  ) {
    return fail("INVALID_CONTEXT_ID", "$.id", "WorkContext id must be a bounded opaque token");
  }
  const typeRef = parseExactReference(root.typeRef as JsonValue, "$.typeRef");
  if (!typeRef.ok) return typeRef;
  const items = parseItems(root.items);
  if (!items.ok) return items;
  const value: ViraWorkContext = {
    schemaVersion: VIRA_WORK_CONTEXT_SCHEMA_VERSION,
    id: root.id,
    typeRef: typeRef.value,
    items: items.value,
  };
  return { ok: true, value: freeze(value) };
}

export function serializeViraWorkContextDefinition(input: unknown): ViraWorkContextDefinitionSerializationResult {
  const parsed = parseViraWorkContextDefinition(input);
  if (!parsed.ok) return parsed;
  return { ok: true, value: JSON.stringify(parsed.value), definition: parsed.value };
}

export function serializeViraWorkContext(input: unknown): ViraWorkContextSerializationResult {
  const parsed = parseViraWorkContext(input);
  if (!parsed.ok) return parsed;
  return { ok: true, value: JSON.stringify(parsed.value), context: parsed.value };
}
