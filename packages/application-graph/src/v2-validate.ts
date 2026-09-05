import {
  isSemanticNamespace,
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import type {
  ViraApplicationGraphExactReference,
  ViraApplicationGraphValidationCode,
} from "./types.js";
import { parseViraApplicationGraph } from "./validate.js";
import {
  VIRA_APPLICATION_GRAPH_V2_SCHEMA_VERSION,
  type ViraApplicationGraphNodeV2,
  type ViraApplicationGraphV2,
  type ViraApplicationGraphV2Result,
  type ViraApplicationGraphV2SerializationResult,
  type ViraApplicationGraphV2ValidationIssue,
} from "./v2-types.js";

const VERSION_REF = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/;
const FLOATING_ALIASES = new Set(["latest", "current", "stable", "head", "main", "next"]);

type Failure = { readonly ok: false; readonly issue: ViraApplicationGraphV2ValidationIssue };
type Parsed<T> = { readonly ok: true; readonly value: T } | Failure;

function fail(code: ViraApplicationGraphValidationCode, path: string, message: string): Failure {
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

function exactVersionRef(value: JsonValue | undefined): value is string {
  if (typeof value !== "string" || !VERSION_REF.test(value)) return false;
  const normalized = value.toLowerCase();
  if (FLOATING_ALIASES.has(normalized)) return false;
  return !/(?:^|[._:+-])[xX](?:$|[._:+-])/.test(value)
    && !/\d[xX](?:$|[._:+-])/.test(value);
}

function floatingVersionRef(value: JsonValue | undefined): boolean {
  if (typeof value !== "string" || !VERSION_REF.test(value)) return false;
  return FLOATING_ALIASES.has(value.toLowerCase())
    || /(?:^|[._:+-])[xX](?:$|[._:+-])/.test(value)
    || /\d[xX](?:$|[._:+-])/.test(value);
}

function parseExactReference(value: JsonValue | undefined, path: string): Parsed<ViraApplicationGraphExactReference> {
  if (!object(value)) return fail("INVALID_REFERENCE", path, "reference must be an exact object");
  const unexpected = shape(value, ["id", "versionRef"]);
  if (unexpected) return fail("INVALID_REFERENCE", `${path}.${unexpected}`, "reference shape is invalid");
  if (typeof value.id !== "string" || !isSemanticNamespace(value.id)) {
    return fail("INVALID_REFERENCE", `${path}.id`, "reference id must be a canonical semantic namespace");
  }
  if (!exactVersionRef(value.versionRef)) {
    return fail(
      floatingVersionRef(value.versionRef) ? "FLOATING_REFERENCE" : "INVALID_REFERENCE",
      `${path}.versionRef`,
      "reference version must be exact and must not float",
    );
  }
  return {
    ok: true,
    value: Object.freeze({ id: value.id, versionRef: value.versionRef }),
  };
}

export function parseViraApplicationGraphV2(input: unknown): ViraApplicationGraphV2Result {
  const parsed = parseJsonValue(input, "$");
  if (!parsed.ok || !object(parsed.value)) {
    return fail(
      "INVALID_TYPE",
      parsed.ok ? "$" : parsed.issue.path,
      parsed.ok ? "ApplicationGraph V2 must be a plain object" : parsed.issue.reason,
    );
  }

  const root = parsed.value;
  const unexpected = shape(root, ["schemaVersion", "id", "version", "publisher", "metadata", "nodes", "edges"]);
  if (unexpected) return fail("UNKNOWN_FIELD", `$.${unexpected}`, "ApplicationGraph V2 shape is invalid");
  if (root.schemaVersion !== VIRA_APPLICATION_GRAPH_V2_SCHEMA_VERSION) {
    return fail(
      "INVALID_SCHEMA_VERSION",
      "$.schemaVersion",
      `schemaVersion must equal ${VIRA_APPLICATION_GRAPH_V2_SCHEMA_VERSION}`,
    );
  }
  if (!Array.isArray(root.nodes)) return fail("INVALID_NODE", "$.nodes", "nodes must be an array");

  const actionRefs = new Map<number, ViraApplicationGraphExactReference>();
  const projectedNodes: unknown[] = [];
  for (let index = 0; index < root.nodes.length; index += 1) {
    const path = `$.nodes[${index}]`;
    const node = root.nodes[index] as JsonValue;
    if (!object(node)) return fail("INVALID_NODE", path, "node must be an exact object");
    const nodeUnexpected = shape(node, ["id", "target"]);
    if (nodeUnexpected) return fail("INVALID_NODE", `${path}.${nodeUnexpected}`, "node shape is invalid");
    if (!object(node.target)) return fail("INVALID_NODE_TARGET", `${path}.target`, "node target must be an exact object");

    if (node.target.kind === "action") {
      const targetUnexpected = shape(node.target, ["kind", "ref"]);
      if (targetUnexpected) {
        return fail("INVALID_NODE_TARGET", `${path}.target.${targetUnexpected}`, "action target shape is invalid");
      }
      const ref = parseExactReference(node.target.ref, `${path}.target.ref`);
      if (!ref.ok) return ref;
      actionRefs.set(index, ref.value);
      projectedNodes.push({
        id: node.id,
        target: { kind: "action", actionType: ref.value.id },
      });
    } else {
      projectedNodes.push(node);
    }
  }

  const shared = parseViraApplicationGraph({
    schemaVersion: "1",
    id: root.id,
    version: root.version,
    publisher: root.publisher,
    metadata: root.metadata,
    nodes: projectedNodes,
    edges: root.edges,
  });
  if (!shared.ok) return fail(shared.issue.code, shared.issue.path, shared.issue.message);

  const nodes: ViraApplicationGraphNodeV2[] = [];
  for (let index = 0; index < shared.value.nodes.length; index += 1) {
    const node = shared.value.nodes[index]!;
    const target = node.target;
    if (target.kind !== "action") {
      nodes.push(Object.freeze({ id: node.id, target }));
      continue;
    }
    const ref = actionRefs.get(index);
    if (!ref) return fail("INVALID_NODE_TARGET", `$.nodes[${index}].target.ref`, "exact Action ref was not preserved");
    nodes.push(Object.freeze({ id: node.id, target: Object.freeze({ kind: "action" as const, ref }) }));
  }

  const value: ViraApplicationGraphV2 = Object.freeze({
    schemaVersion: VIRA_APPLICATION_GRAPH_V2_SCHEMA_VERSION,
    id: shared.value.id,
    version: shared.value.version,
    publisher: shared.value.publisher,
    metadata: shared.value.metadata,
    nodes: Object.freeze(nodes),
    edges: shared.value.edges,
  });
  return { ok: true, value };
}

export function serializeViraApplicationGraphV2(input: unknown): ViraApplicationGraphV2SerializationResult {
  const parsed = parseViraApplicationGraphV2(input);
  if (!parsed.ok) return parsed;
  return { ok: true, value: JSON.stringify(parsed.value), graph: parsed.value };
}
