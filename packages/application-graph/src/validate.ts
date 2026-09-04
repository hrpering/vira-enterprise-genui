import {
  isSemanticNamespace,
  isSemanticSegment,
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import {
  VIRA_APPLICATION_GRAPH_DESCRIPTION_MAX_LENGTH,
  VIRA_APPLICATION_GRAPH_EDGE_KINDS,
  VIRA_APPLICATION_GRAPH_MAX_EDGES,
  VIRA_APPLICATION_GRAPH_MAX_NODES,
  VIRA_APPLICATION_GRAPH_NAME_MAX_LENGTH,
  VIRA_APPLICATION_GRAPH_PUBLISHER_NAME_MAX_LENGTH,
  VIRA_APPLICATION_GRAPH_SCHEMA_VERSION,
  type ViraApplicationGraph,
  type ViraApplicationGraphEdge,
  type ViraApplicationGraphEdgeKind,
  type ViraApplicationGraphExactReference,
  type ViraApplicationGraphExperienceReference,
  type ViraApplicationGraphMetadata,
  type ViraApplicationGraphNode,
  type ViraApplicationGraphNodeTarget,
  type ViraApplicationGraphPublisher,
  type ViraApplicationGraphResult,
  type ViraApplicationGraphSerializationResult,
  type ViraApplicationGraphValidationCode,
  type ViraApplicationGraphValidationIssue,
} from "./types.js";

const RELEASE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const VERSION_REF = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/;
const PACK_ID = /^[a-z0-9](?:[a-z0-9._-]{0,62})\/[a-z0-9](?:[a-z0-9._-]{0,62})$/;
const ENTRYPOINT = /^[a-z][a-z0-9._-]{0,127}$/;
const FLOATING_ALIASES = new Set(["latest", "current", "stable", "head", "main", "next"]);
const EDGE_KINDS = new Set<string>(VIRA_APPLICATION_GRAPH_EDGE_KINDS);

type Failure = { readonly ok: false; readonly issue: ViraApplicationGraphValidationIssue };
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

function freeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) freeze(item);
    return Object.freeze(value) as T;
  }
  for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  return Object.freeze(value);
}

function parsePublisher(value: JsonValue | undefined): Parsed<ViraApplicationGraphPublisher> {
  if (!object(value)) return fail("INVALID_PUBLISHER", "$.publisher", "publisher must be an exact object");
  const unexpected = shape(value, ["id", "name"]);
  if (unexpected) return fail("INVALID_PUBLISHER", `$.publisher.${unexpected}`, "publisher shape is invalid");
  if (typeof value.id !== "string" || !isSemanticSegment(value.id)) {
    return fail("INVALID_PUBLISHER", "$.publisher.id", "publisher id must be a canonical semantic segment");
  }
  if (!boundedText(value.name, VIRA_APPLICATION_GRAPH_PUBLISHER_NAME_MAX_LENGTH)) {
    return fail("INVALID_PUBLISHER", "$.publisher.name", "publisher name is invalid");
  }
  return { ok: true, value: Object.freeze({ id: value.id, name: value.name }) };
}

function parseMetadata(value: JsonValue | undefined): Parsed<ViraApplicationGraphMetadata> {
  if (!object(value)) return fail("INVALID_METADATA", "$.metadata", "metadata must be an exact object");
  const unexpected = shape(value, ["name", "description"], ["name"]);
  if (unexpected) return fail("INVALID_METADATA", `$.metadata.${unexpected}`, "metadata shape is invalid");
  if (!boundedText(value.name, VIRA_APPLICATION_GRAPH_NAME_MAX_LENGTH)) {
    return fail("INVALID_METADATA", "$.metadata.name", "graph name is invalid");
  }
  const description = value.description;
  if (
    description !== undefined
    && (typeof description !== "string"
      || description.length > VIRA_APPLICATION_GRAPH_DESCRIPTION_MAX_LENGTH
      || description.trim() !== description)
  ) {
    return fail("INVALID_METADATA", "$.metadata.description", "graph description is invalid");
  }
  return {
    ok: true,
    value: Object.freeze({
      name: value.name,
      ...(description === undefined ? {} : { description }),
    }),
  };
}

function parseExactReference(value: JsonValue, path: string): Parsed<ViraApplicationGraphExactReference> {
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

function parseExperienceReference(value: JsonValue | undefined, path: string): Parsed<ViraApplicationGraphExperienceReference> {
  if (!object(value)) return fail("INVALID_REFERENCE", path, "experience reference must be an exact object");
  const unexpected = shape(value, ["id", "packId", "packVersion", "entrypoint"]);
  if (unexpected) return fail("INVALID_REFERENCE", `${path}.${unexpected}`, "experience reference shape is invalid");
  if (typeof value.id !== "string" || !isSemanticNamespace(value.id)) {
    return fail("INVALID_REFERENCE", `${path}.id`, "experience id must be a canonical semantic namespace");
  }
  if (typeof value.packId !== "string" || !PACK_ID.test(value.packId)) {
    return fail("INVALID_REFERENCE", `${path}.packId`, "packId must be an exact canonical Experience Pack id");
  }
  if (!releaseVersion(value.packVersion)) {
    return fail("INVALID_REFERENCE", `${path}.packVersion`, "packVersion must be an exact release semver");
  }
  if (typeof value.entrypoint !== "string" || !ENTRYPOINT.test(value.entrypoint)) {
    return fail("INVALID_REFERENCE", `${path}.entrypoint`, "entrypoint must be an exact Pack entrypoint identity");
  }
  return {
    ok: true,
    value: Object.freeze({
      id: value.id,
      packId: value.packId,
      packVersion: value.packVersion,
      entrypoint: value.entrypoint,
    }),
  };
}

function parseTarget(value: JsonValue | undefined, path: string): Parsed<ViraApplicationGraphNodeTarget> {
  if (!object(value)) return fail("INVALID_NODE_TARGET", path, "node target must be an exact object");
  if (value.kind === "experience") {
    const unexpected = shape(value, ["kind", "ref"]);
    if (unexpected) return fail("INVALID_NODE_TARGET", `${path}.${unexpected}`, "experience target shape is invalid");
    const ref = parseExperienceReference(value.ref, `${path}.ref`);
    if (!ref.ok) return ref;
    return { ok: true, value: Object.freeze({ kind: "experience" as const, ref: ref.value }) };
  }
  if (value.kind === "capability" || value.kind === "context") {
    const unexpected = shape(value, ["kind", "ref"]);
    if (unexpected) return fail("INVALID_NODE_TARGET", `${path}.${unexpected}`, `${String(value.kind)} target shape is invalid`);
    const ref = parseExactReference(value.ref as JsonValue, `${path}.ref`);
    if (!ref.ok) return ref;
    if (value.kind === "capability") {
      return { ok: true, value: Object.freeze({ kind: "capability" as const, ref: ref.value }) };
    }
    return { ok: true, value: Object.freeze({ kind: "context" as const, ref: ref.value }) };
  }
  if (value.kind === "action") {
    const unexpected = shape(value, ["kind", "actionType"]);
    if (unexpected) return fail("INVALID_NODE_TARGET", `${path}.${unexpected}`, "action target shape is invalid");
    if (typeof value.actionType !== "string" || !isSemanticNamespace(value.actionType)) {
      return fail("INVALID_NODE_TARGET", `${path}.actionType`, "actionType must be a canonical semantic namespace");
    }
    return { ok: true, value: Object.freeze({ kind: "action" as const, actionType: value.actionType }) };
  }
  return fail("INVALID_NODE_TARGET", `${path}.kind`, "node target kind must be experience, capability, context or action");
}

function parseNodes(value: JsonValue | undefined): Parsed<readonly ViraApplicationGraphNode[]> {
  if (!Array.isArray(value)) return fail("INVALID_NODE", "$.nodes", "nodes must be an array");
  if (value.length > VIRA_APPLICATION_GRAPH_MAX_NODES) {
    return fail("NODE_LIMIT_EXCEEDED", "$.nodes", `node limit is ${VIRA_APPLICATION_GRAPH_MAX_NODES}`);
  }
  if (value.length === 0) return fail("EMPTY_GRAPH", "$.nodes", "ApplicationGraph must contain at least one semantic node");
  const nodes: ViraApplicationGraphNode[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const path = `$.nodes[${index}]`;
    const item = value[index] as JsonValue;
    if (!object(item)) return fail("INVALID_NODE", path, "node must be an exact object");
    const unexpected = shape(item, ["id", "target"]);
    if (unexpected) return fail("INVALID_NODE", `${path}.${unexpected}`, "node shape is invalid");
    if (typeof item.id !== "string" || !isSemanticSegment(item.id)) {
      return fail("INVALID_NODE", `${path}.id`, "node id must be a canonical semantic segment");
    }
    if (seen.has(item.id)) return fail("DUPLICATE_NODE", `${path}.id`, "duplicate graph node id");
    const target = parseTarget(item.target, `${path}.target`);
    if (!target.ok) return target;
    seen.add(item.id);
    nodes.push(Object.freeze({ id: item.id, target: target.value }));
  }
  return { ok: true, value: Object.freeze(nodes) };
}

function validRelation(kind: ViraApplicationGraphEdgeKind, from: ViraApplicationGraphNode, to: ViraApplicationGraphNode): boolean {
  const fromKind = from.target.kind;
  const toKind = to.target.kind;
  switch (kind) {
    case "experience-uses-capability":
      return fromKind === "experience" && toKind === "capability";
    case "experience-offers-action":
      return fromKind === "experience" && toKind === "action";
    case "context-input":
      return fromKind === "context" && (toKind === "experience" || toKind === "capability" || toKind === "action");
    case "context-output":
      return (fromKind === "experience" || fromKind === "capability" || fromKind === "action") && toKind === "context";
    case "semantic-transition":
      return fromKind === "experience" && toKind === "experience";
  }
}

function parseEdges(
  value: JsonValue | undefined,
  nodes: readonly ViraApplicationGraphNode[],
): Parsed<readonly ViraApplicationGraphEdge[]> {
  if (!Array.isArray(value)) return fail("INVALID_EDGE", "$.edges", "edges must be an array");
  if (value.length > VIRA_APPLICATION_GRAPH_MAX_EDGES) {
    return fail("EDGE_LIMIT_EXCEEDED", "$.edges", `edge limit is ${VIRA_APPLICATION_GRAPH_MAX_EDGES}`);
  }
  const byId = new Map(nodes.map((node) => [node.id, node] as const));
  const seenIds = new Set<string>();
  const seenRelations = new Set<string>();
  const edges: ViraApplicationGraphEdge[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const path = `$.edges[${index}]`;
    const item = value[index] as JsonValue;
    if (!object(item)) return fail("INVALID_EDGE", path, "edge must be an exact object");
    const unexpected = shape(item, ["id", "kind", "from", "to"]);
    if (unexpected) return fail("INVALID_EDGE", `${path}.${unexpected}`, "edge shape is invalid");
    if (typeof item.id !== "string" || !isSemanticSegment(item.id)) {
      return fail("INVALID_EDGE", `${path}.id`, "edge id must be a canonical semantic segment");
    }
    if (seenIds.has(item.id)) return fail("DUPLICATE_EDGE", `${path}.id`, "duplicate graph edge id");
    if (typeof item.kind !== "string" || !EDGE_KINDS.has(item.kind)) {
      return fail("INVALID_EDGE_KIND", `${path}.kind`, "edge kind is not a canonical ApplicationGraph relation");
    }
    if (typeof item.from !== "string" || !isSemanticSegment(item.from)) {
      return fail("INVALID_EDGE", `${path}.from`, "edge source must be a canonical local node id");
    }
    if (typeof item.to !== "string" || !isSemanticSegment(item.to)) {
      return fail("INVALID_EDGE", `${path}.to`, "edge target must be a canonical local node id");
    }
    if (item.from === item.to) return fail("INVALID_EDGE_RELATION", path, "self edges are not semantic ApplicationGraph relations");
    const from = byId.get(item.from);
    if (!from) return fail("EDGE_NODE_NOT_FOUND", `${path}.from`, "edge source node does not exist");
    const to = byId.get(item.to);
    if (!to) return fail("EDGE_NODE_NOT_FOUND", `${path}.to`, "edge target node does not exist");
    const kind = item.kind as ViraApplicationGraphEdgeKind;
    if (!validRelation(kind, from, to)) {
      return fail("INVALID_EDGE_RELATION", path, `edge kind ${kind} is incompatible with ${from.target.kind} → ${to.target.kind}`);
    }
    const relationKey = `${kind}\u0000${item.from}\u0000${item.to}`;
    if (seenRelations.has(relationKey)) return fail("DUPLICATE_EDGE", path, "duplicate semantic graph relation");
    seenIds.add(item.id);
    seenRelations.add(relationKey);
    edges.push(Object.freeze({ id: item.id, kind, from: item.from, to: item.to }));
  }
  return { ok: true, value: Object.freeze(edges) };
}

export function parseViraApplicationGraph(input: unknown): ViraApplicationGraphResult {
  const parsed = parseJsonValue(input, "$");
  if (!parsed.ok || !object(parsed.value)) {
    return fail(
      "INVALID_TYPE",
      parsed.ok ? "$" : parsed.issue.path,
      parsed.ok ? "ApplicationGraph must be a plain object" : parsed.issue.reason,
    );
  }
  const root = parsed.value;
  const unexpected = shape(root, ["schemaVersion", "id", "version", "publisher", "metadata", "nodes", "edges"]);
  if (unexpected) return fail("UNKNOWN_FIELD", `$.${unexpected}`, `unknown or missing ApplicationGraph field: ${unexpected}`);
  if (root.schemaVersion !== VIRA_APPLICATION_GRAPH_SCHEMA_VERSION) {
    return fail("INVALID_SCHEMA_VERSION", "$.schemaVersion", `schemaVersion must equal ${VIRA_APPLICATION_GRAPH_SCHEMA_VERSION}`);
  }
  if (typeof root.id !== "string" || !isSemanticNamespace(root.id) || !root.id.includes(".")) {
    return fail("INVALID_ID", "$.id", "ApplicationGraph id must be a namespaced semantic identity");
  }
  if (!releaseVersion(root.version)) {
    return fail("INVALID_VERSION", "$.version", "ApplicationGraph release version must be semver");
  }
  const publisher = parsePublisher(root.publisher);
  if (!publisher.ok) return publisher;
  if (root.id.split(".")[0] !== publisher.value.id) {
    return fail("INVALID_PUBLISHER", "$.publisher.id", "publisher id must match ApplicationGraph identity namespace");
  }
  const metadata = parseMetadata(root.metadata);
  if (!metadata.ok) return metadata;
  const nodes = parseNodes(root.nodes);
  if (!nodes.ok) return nodes;
  const edges = parseEdges(root.edges, nodes.value);
  if (!edges.ok) return edges;
  const value: ViraApplicationGraph = {
    schemaVersion: VIRA_APPLICATION_GRAPH_SCHEMA_VERSION,
    id: root.id,
    version: root.version,
    publisher: publisher.value,
    metadata: metadata.value,
    nodes: nodes.value,
    edges: edges.value,
  };
  return { ok: true, value: freeze(value) };
}

export function serializeViraApplicationGraph(input: unknown): ViraApplicationGraphSerializationResult {
  const parsed = parseViraApplicationGraph(input);
  if (!parsed.ok) return parsed;
  return { ok: true, value: JSON.stringify(parsed.value), graph: parsed.value };
}
