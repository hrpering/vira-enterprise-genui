import {
  isSemanticNamespace,
  isSemanticSegment,
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import { parseViraCapabilityExactReference } from "./reference.js";
import { parseViraCapabilityReleaseReference } from "./release-reference.js";
import {
  VIRA_CAPABILITY_DEFINITION_SCHEMA_VERSION,
  VIRA_CAPABILITY_DESCRIPTION_MAX_LENGTH,
  VIRA_CAPABILITY_MAX_CONTEXT_REQUIREMENTS,
  VIRA_CAPABILITY_NAME_MAX_LENGTH,
  VIRA_CAPABILITY_PUBLISHER_NAME_MAX_LENGTH,
  type ViraCapabilityDefinition,
  type ViraCapabilityDefinitionResult,
  type ViraCapabilityExactReference,
  type ViraCapabilityInvocation,
  type ViraCapabilityMetadata,
  type ViraCapabilityPublisher,
  type ViraCapabilitySerializationResult,
  type ViraCapabilityValidationCode,
  type ViraCapabilityValidationIssue,
  type ViraCapabilityValueContract,
} from "./types.js";

type Failure = { readonly ok: false; readonly issue: ViraCapabilityValidationIssue };
type Parsed<T> = { readonly ok: true; readonly value: T } | Failure;

function fail(code: ViraCapabilityValidationCode, path: string, message: string): Failure {
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

function freeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) freeze(item);
    return Object.freeze(value) as T;
  }
  for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  return Object.freeze(value);
}

function referencePath(ownerPath: string, path: string): string {
  if (ownerPath === "$" || ownerPath.length === 0) return path;
  if (ownerPath.startsWith("$.")) return `${path}${ownerPath.slice(1)}`;
  return path;
}

function parseExactReference(value: JsonValue, path: string): Parsed<ViraCapabilityExactReference> {
  const parsed = parseViraCapabilityExactReference(value);
  if (parsed.ok) return parsed;
  return fail(parsed.issue.code, referencePath(parsed.issue.path, path), parsed.issue.message);
}

function parsePublisher(value: JsonValue | undefined): Parsed<ViraCapabilityPublisher> {
  if (!object(value)) return fail("INVALID_PUBLISHER", "$.publisher", "publisher must be an exact object");
  const unexpected = shape(value, ["id", "name"]);
  if (unexpected) return fail("INVALID_PUBLISHER", `$.publisher.${unexpected}`, "publisher shape is invalid");
  if (typeof value.id !== "string" || !isSemanticSegment(value.id)) {
    return fail("INVALID_PUBLISHER", "$.publisher.id", "publisher id must be a canonical semantic segment");
  }
  if (!boundedText(value.name, VIRA_CAPABILITY_PUBLISHER_NAME_MAX_LENGTH)) {
    return fail("INVALID_PUBLISHER", "$.publisher.name", "publisher name is invalid");
  }
  return { ok: true, value: Object.freeze({ id: value.id, name: value.name }) };
}

function parseMetadata(value: JsonValue | undefined): Parsed<ViraCapabilityMetadata> {
  if (!object(value)) return fail("INVALID_METADATA", "$.metadata", "metadata must be an exact object");
  const unexpected = shape(value, ["name", "description"], ["name"]);
  if (unexpected) return fail("INVALID_METADATA", `$.metadata.${unexpected}`, "metadata shape is invalid");
  if (!boundedText(value.name, VIRA_CAPABILITY_NAME_MAX_LENGTH)) {
    return fail("INVALID_METADATA", "$.metadata.name", "capability name is invalid");
  }
  const description = value.description;
  if (
    description !== undefined
    && (typeof description !== "string"
      || description.length > VIRA_CAPABILITY_DESCRIPTION_MAX_LENGTH
      || description.trim() !== description)
  ) {
    return fail("INVALID_METADATA", "$.metadata.description", "capability description is invalid");
  }
  return {
    ok: true,
    value: Object.freeze({
      name: value.name,
      ...(description === undefined ? {} : { description }),
    }),
  };
}

function parseValueContract(value: JsonValue | undefined, path: string): Parsed<ViraCapabilityValueContract> {
  if (!object(value)) return fail("INVALID_VALUE_CONTRACT", path, "value contract must be an exact object");
  const unexpected = shape(value, ["typeRef"]);
  if (unexpected) return fail("INVALID_VALUE_CONTRACT", `${path}.${unexpected}`, "value contract shape is invalid");
  if (value.typeRef === null) return { ok: true, value: Object.freeze({ typeRef: null }) };
  const reference = parseExactReference(value.typeRef as JsonValue, `${path}.typeRef`);
  if (!reference.ok) return reference;
  return { ok: true, value: Object.freeze({ typeRef: reference.value }) };
}

function parseContextRequirements(value: JsonValue | undefined): Parsed<readonly ViraCapabilityExactReference[]> {
  if (!Array.isArray(value)) {
    return fail("INVALID_REFERENCE", "$.contextRequirements", "contextRequirements must be an array");
  }
  if (value.length > VIRA_CAPABILITY_MAX_CONTEXT_REQUIREMENTS) {
    return fail(
      "CONTEXT_LIMIT_EXCEEDED",
      "$.contextRequirements",
      `context requirement limit is ${VIRA_CAPABILITY_MAX_CONTEXT_REQUIREMENTS}`,
    );
  }
  const output: ViraCapabilityExactReference[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const parsed = parseExactReference(value[index] as JsonValue, `$.contextRequirements[${index}]`);
    if (!parsed.ok) return parsed;
    const key = `${parsed.value.id}\u0000${parsed.value.versionRef}`;
    if (seen.has(key)) {
      return fail("DUPLICATE_REFERENCE", `$.contextRequirements[${index}]`, "duplicate context requirement");
    }
    seen.add(key);
    output.push(parsed.value);
  }
  return { ok: true, value: Object.freeze(output) };
}

function parseInvocation(value: JsonValue | undefined): Parsed<ViraCapabilityInvocation> {
  if (!object(value)) return fail("INVALID_INVOCATION", "$.invocation", "invocation must be an exact object");
  if (value.kind === "query") {
    const unexpected = shape(value, ["kind"]);
    if (unexpected) return fail("INVALID_INVOCATION", `$.invocation.${unexpected}`, "query invocation shape is invalid");
    return { ok: true, value: Object.freeze({ kind: "query" as const }) };
  }
  if (value.kind === "action") {
    const unexpected = shape(value, ["kind", "actionType"]);
    if (unexpected) return fail("INVALID_INVOCATION", `$.invocation.${unexpected}`, "action invocation shape is invalid");
    if (typeof value.actionType !== "string" || !isSemanticNamespace(value.actionType)) {
      return fail("INVALID_ACTION_TYPE", "$.invocation.actionType", "actionType must be a canonical semantic namespace");
    }
    return {
      ok: true,
      value: Object.freeze({ kind: "action" as const, actionType: value.actionType }),
    };
  }
  return fail("INVALID_INVOCATION", "$.invocation.kind", "invocation kind must be query or action");
}

export function parseViraCapabilityDefinition(input: unknown): ViraCapabilityDefinitionResult {
  const parsed = parseJsonValue(input, "$");
  if (!parsed.ok || !object(parsed.value)) {
    return fail(
      "INVALID_TYPE",
      parsed.ok ? "$" : parsed.issue.path,
      parsed.ok ? "capability definition must be a plain object" : parsed.issue.reason,
    );
  }

  const root = parsed.value;
  const fields = [
    "schemaVersion",
    "id",
    "version",
    "publisher",
    "metadata",
    "input",
    "output",
    "contextRequirements",
    "invocation",
  ] as const;
  const unexpected = shape(root, fields);
  if (unexpected) return fail("UNKNOWN_FIELD", `$.${unexpected}`, `unknown or missing capability field: ${unexpected}`);
  if (root.schemaVersion !== VIRA_CAPABILITY_DEFINITION_SCHEMA_VERSION) {
    return fail(
      "INVALID_SCHEMA_VERSION",
      "$.schemaVersion",
      `schemaVersion must equal ${VIRA_CAPABILITY_DEFINITION_SCHEMA_VERSION}`,
    );
  }

  const release = parseViraCapabilityReleaseReference({ id: root.id, version: root.version });
  if (!release.ok) return release;

  const publisher = parsePublisher(root.publisher);
  if (!publisher.ok) return publisher;
  if (release.value.id.split(".")[0] !== publisher.value.id) {
    return fail("INVALID_PUBLISHER", "$.publisher.id", "publisher id must match capability identity namespace");
  }
  const metadata = parseMetadata(root.metadata);
  if (!metadata.ok) return metadata;
  const inputContract = parseValueContract(root.input, "$.input");
  if (!inputContract.ok) return inputContract;
  const outputContract = parseValueContract(root.output, "$.output");
  if (!outputContract.ok) return outputContract;
  const contextRequirements = parseContextRequirements(root.contextRequirements);
  if (!contextRequirements.ok) return contextRequirements;
  const invocation = parseInvocation(root.invocation);
  if (!invocation.ok) return invocation;

  const value: ViraCapabilityDefinition = {
    schemaVersion: VIRA_CAPABILITY_DEFINITION_SCHEMA_VERSION,
    id: release.value.id,
    version: release.value.version,
    publisher: publisher.value,
    metadata: metadata.value,
    input: inputContract.value,
    output: outputContract.value,
    contextRequirements: contextRequirements.value,
    invocation: invocation.value,
  };
  return { ok: true, value: freeze(value) };
}

export function serializeViraCapabilityDefinition(input: unknown): ViraCapabilitySerializationResult {
  const parsed = parseViraCapabilityDefinition(input);
  if (!parsed.ok) return parsed;
  return { ok: true, value: JSON.stringify(parsed.value), definition: parsed.value };
}
