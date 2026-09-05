import {
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import { parseViraCapabilityExactReference } from "./reference.js";
import { parseViraCapabilityDefinition } from "./validate.js";
import type {
  ViraCapabilityExactReference,
  ViraCapabilityValidationCode,
} from "./types.js";
import {
  VIRA_CAPABILITY_DEFINITION_V2_SCHEMA_VERSION,
  type ViraCapabilityDefinitionV2,
  type ViraCapabilityDefinitionV2Result,
  type ViraCapabilityDefinitionV2SerializationResult,
  type ViraCapabilityDefinitionV2ValidationIssue,
  type ViraCapabilityInvocationV2,
} from "./v2-types.js";

type Failure = { readonly ok: false; readonly issue: ViraCapabilityDefinitionV2ValidationIssue };
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

function nestedPath(base: string, child: string): string {
  return child === "$" ? base : `${base}${child.slice(1)}`;
}

function parseActionRef(value: JsonValue | undefined): Parsed<ViraCapabilityExactReference> {
  const parsed = parseViraCapabilityExactReference(value);
  if (parsed.ok) return parsed;
  return fail(parsed.issue.code, nestedPath("$.invocation.actionRef", parsed.issue.path), parsed.issue.message);
}

export function parseViraCapabilityDefinitionV2(input: unknown): ViraCapabilityDefinitionV2Result {
  const parsed = parseJsonValue(input, "$");
  if (!parsed.ok || !object(parsed.value)) {
    return fail(
      "INVALID_TYPE",
      parsed.ok ? "$" : parsed.issue.path,
      parsed.ok ? "Capability V2 must be a plain object" : parsed.issue.reason,
    );
  }
  const root = parsed.value;
  const unexpected = shape(root, [
    "schemaVersion",
    "id",
    "version",
    "publisher",
    "metadata",
    "input",
    "output",
    "contextRequirements",
    "invocation",
  ]);
  if (unexpected) return fail("UNKNOWN_FIELD", `$.${unexpected}`, "Capability V2 shape is invalid");
  if (root.schemaVersion !== VIRA_CAPABILITY_DEFINITION_V2_SCHEMA_VERSION) {
    return fail(
      "INVALID_SCHEMA_VERSION",
      "$.schemaVersion",
      `schemaVersion must equal ${VIRA_CAPABILITY_DEFINITION_V2_SCHEMA_VERSION}`,
    );
  }
  if (!object(root.invocation)) return fail("INVALID_INVOCATION", "$.invocation", "invocation must be an exact object");

  let invocation: ViraCapabilityInvocationV2;
  let projectedInvocation: JsonObject;
  if (root.invocation.kind === "query") {
    const invocationUnexpected = shape(root.invocation, ["kind"]);
    if (invocationUnexpected) {
      return fail("INVALID_INVOCATION", `$.invocation.${invocationUnexpected}`, "query invocation shape is invalid");
    }
    invocation = Object.freeze({ kind: "query" as const });
    projectedInvocation = { kind: "query" };
  } else if (root.invocation.kind === "action") {
    const invocationUnexpected = shape(root.invocation, ["kind", "actionRef"]);
    if (invocationUnexpected) {
      return fail("INVALID_INVOCATION", `$.invocation.${invocationUnexpected}`, "action invocation shape is invalid");
    }
    const actionRef = parseActionRef(root.invocation.actionRef);
    if (!actionRef.ok) return actionRef;
    invocation = Object.freeze({ kind: "action" as const, actionRef: actionRef.value });
    projectedInvocation = { kind: "action", actionType: actionRef.value.id };
  } else {
    return fail("INVALID_INVOCATION", "$.invocation.kind", "invocation kind must be query or action");
  }

  const shared = parseViraCapabilityDefinition({
    schemaVersion: "1",
    id: root.id,
    version: root.version,
    publisher: root.publisher,
    metadata: root.metadata,
    input: root.input,
    output: root.output,
    contextRequirements: root.contextRequirements,
    invocation: projectedInvocation,
  });
  if (!shared.ok) return fail(shared.issue.code, shared.issue.path, shared.issue.message);

  const value: ViraCapabilityDefinitionV2 = Object.freeze({
    schemaVersion: VIRA_CAPABILITY_DEFINITION_V2_SCHEMA_VERSION,
    id: shared.value.id,
    version: shared.value.version,
    publisher: shared.value.publisher,
    metadata: shared.value.metadata,
    input: shared.value.input,
    output: shared.value.output,
    contextRequirements: shared.value.contextRequirements,
    invocation,
  });
  return { ok: true, value };
}

export function serializeViraCapabilityDefinitionV2(input: unknown): ViraCapabilityDefinitionV2SerializationResult {
  const parsed = parseViraCapabilityDefinitionV2(input);
  if (!parsed.ok) return parsed;
  return { ok: true, value: JSON.stringify(parsed.value), definition: parsed.value };
}
