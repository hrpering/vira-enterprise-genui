import {
  parseViraApplicationGraph,
  type ViraApplicationGraph,
} from "@vira-enterprise-genui/application-graph";
import {
  parseViraApplicationPackage,
  type ViraApplicationPackage,
} from "@vira-enterprise-genui/application-package";
import {
  isSemanticNamespace,
  isSemanticSegment,
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import {
  VIRA_CANVAS_DRAFT_ID_MAX_LENGTH,
  VIRA_CANVAS_DRAFT_SCHEMA_VERSION,
  VIRA_CANVAS_MAX_COORDINATE,
  VIRA_CANVAS_MAX_GRAPHS,
  VIRA_CANVAS_MAX_GRAPH_VIEWS,
  VIRA_CANVAS_MAX_NODE_LAYOUTS,
  VIRA_CANVAS_MAX_SELECTED_EDGES,
  VIRA_CANVAS_MAX_SELECTED_NODES,
  VIRA_CANVAS_MAX_ZOOM,
  VIRA_CANVAS_MIN_ZOOM,
  type ViraCanvasDraft,
  type ViraCanvasDraftResult,
  type ViraCanvasDraftSerializationResult,
  type ViraCanvasGraphRef,
  type ViraCanvasGraphView,
  type ViraCanvasNodeLayout,
  type ViraCanvasProjection,
  type ViraCanvasSelection,
  type ViraCanvasSemantics,
  type ViraCanvasSemanticsResult,
  type ViraCanvasSemanticsSerializationResult,
  type ViraCanvasValidationCode,
  type ViraCanvasValidationIssue,
  type ViraCanvasViewport,
} from "./types.js";

const DRAFT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const RELEASE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

type Failure = { readonly ok: false; readonly issue: ViraCanvasValidationIssue };
type Parsed<T> = { readonly ok: true; readonly value: T } | Failure;

function fail(code: ViraCanvasValidationCode, path: string, message: string): Failure {
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

function graphKey(ref: ViraCanvasGraphRef): string {
  return `${ref.id}\u0000${ref.version}`;
}

function coordinate(value: JsonValue | undefined): value is number {
  return typeof value === "number" && Math.abs(value) <= VIRA_CANVAS_MAX_COORDINATE;
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

function parseGraphRef(value: JsonValue | undefined, path: string): Parsed<ViraCanvasGraphRef> {
  if (!object(value)) return fail("INVALID_PROJECTION", path, "graph reference must be an exact object");
  const unexpected = shape(value, ["id", "version"]);
  if (unexpected) return fail("INVALID_PROJECTION", `${path}.${unexpected}`, "graph reference shape is invalid");
  if (typeof value.id !== "string" || !isSemanticNamespace(value.id)) {
    return fail("INVALID_PROJECTION", `${path}.id`, "graph reference id must be a canonical semantic namespace");
  }
  if (typeof value.version !== "string" || !RELEASE_VERSION.test(value.version)) {
    return fail("INVALID_PROJECTION", `${path}.version`, "graph reference version must be an exact release semver");
  }
  return { ok: true, value: Object.freeze({ id: value.id, version: value.version }) };
}

function parseSemantics(value: JsonValue | undefined): Parsed<ViraCanvasSemantics> {
  if (!object(value)) return fail("INVALID_SEMANTICS", "$.semantics", "semantics must be an exact object");
  const unexpected = shape(value, ["application", "graphs"]);
  if (unexpected) return fail("INVALID_SEMANTICS", `$.semantics.${unexpected}`, "semantics shape is invalid");

  const application = parseViraApplicationPackage(value.application);
  if (!application.ok) {
    return fail(
      "INVALID_APPLICATION",
      nestedPath("$.semantics.application", application.issue.path),
      application.issue.message,
    );
  }

  if (!Array.isArray(value.graphs)) return fail("INVALID_GRAPH", "$.semantics.graphs", "graphs must be an array");
  if (value.graphs.length > VIRA_CANVAS_MAX_GRAPHS) {
    return fail("GRAPH_LIMIT_EXCEEDED", "$.semantics.graphs", `graph limit is ${VIRA_CANVAS_MAX_GRAPHS}`);
  }

  const graphs: ViraApplicationGraph[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.graphs.length; index += 1) {
    const path = `$.semantics.graphs[${index}]`;
    const graph = parseViraApplicationGraph(value.graphs[index]);
    if (!graph.ok) {
      return fail("INVALID_GRAPH", nestedPath(path, graph.issue.path), graph.issue.message);
    }
    const key = `${graph.value.id}\u0000${graph.value.version}`;
    if (seen.has(key)) return fail("DUPLICATE_GRAPH", path, "duplicate exact ApplicationGraph release");
    seen.add(key);
    graphs.push(graph.value);
  }

  return {
    ok: true,
    value: Object.freeze({ application: application.value, graphs: Object.freeze(graphs) }),
  };
}

function parseViewport(value: JsonValue | undefined, path: string): Parsed<ViraCanvasViewport> {
  if (!object(value)) return fail("INVALID_VIEWPORT", path, "viewport must be an exact object");
  const unexpected = shape(value, ["x", "y", "zoom"]);
  if (unexpected) return fail("INVALID_VIEWPORT", `${path}.${unexpected}`, "viewport shape is invalid");
  if (!coordinate(value.x)) return fail("INVALID_VIEWPORT", `${path}.x`, "viewport x is outside the Canvas coordinate bound");
  if (!coordinate(value.y)) return fail("INVALID_VIEWPORT", `${path}.y`, "viewport y is outside the Canvas coordinate bound");
  if (
    typeof value.zoom !== "number"
    || value.zoom < VIRA_CANVAS_MIN_ZOOM
    || value.zoom > VIRA_CANVAS_MAX_ZOOM
  ) {
    return fail("INVALID_VIEWPORT", `${path}.zoom`, `viewport zoom must be between ${VIRA_CANVAS_MIN_ZOOM} and ${VIRA_CANVAS_MAX_ZOOM}`);
  }
  return { ok: true, value: Object.freeze({ x: value.x, y: value.y, zoom: value.zoom }) };
}

function parseNodeLayouts(
  value: JsonValue | undefined,
  path: string,
  graph: ViraApplicationGraph,
): Parsed<readonly ViraCanvasNodeLayout[]> {
  if (!Array.isArray(value)) return fail("INVALID_NODE_LAYOUT", path, "nodeLayouts must be an array");
  if (value.length > VIRA_CANVAS_MAX_NODE_LAYOUTS) {
    return fail("NODE_LAYOUT_LIMIT_EXCEEDED", path, `node layout limit is ${VIRA_CANVAS_MAX_NODE_LAYOUTS}`);
  }
  const graphNodes = new Set(graph.nodes.map((node) => node.id));
  const seen = new Set<string>();
  const layouts: ViraCanvasNodeLayout[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const itemPath = `${path}[${index}]`;
    const item = value[index] as JsonValue;
    if (!object(item)) return fail("INVALID_NODE_LAYOUT", itemPath, "node layout must be an exact object");
    const unexpected = shape(item, ["nodeId", "x", "y"]);
    if (unexpected) return fail("INVALID_NODE_LAYOUT", `${itemPath}.${unexpected}`, "node layout shape is invalid");
    if (typeof item.nodeId !== "string" || !isSemanticSegment(item.nodeId)) {
      return fail("INVALID_NODE_LAYOUT", `${itemPath}.nodeId`, "nodeId must be a canonical graph-local semantic segment");
    }
    if (!graphNodes.has(item.nodeId)) return fail("NODE_NOT_FOUND", `${itemPath}.nodeId`, "node layout targets a node absent from the graph");
    if (seen.has(item.nodeId)) return fail("DUPLICATE_NODE_LAYOUT", `${itemPath}.nodeId`, "duplicate node layout");
    if (!coordinate(item.x)) return fail("INVALID_NODE_LAYOUT", `${itemPath}.x`, "node x is outside the Canvas coordinate bound");
    if (!coordinate(item.y)) return fail("INVALID_NODE_LAYOUT", `${itemPath}.y`, "node y is outside the Canvas coordinate bound");
    seen.add(item.nodeId);
    layouts.push(Object.freeze({ nodeId: item.nodeId, x: item.x, y: item.y }));
  }
  return { ok: true, value: Object.freeze(layouts) };
}

function parseSelection(
  value: JsonValue | undefined,
  path: string,
  graph: ViraApplicationGraph,
): Parsed<ViraCanvasSelection> {
  if (!object(value)) return fail("INVALID_SELECTION", path, "selection must be an exact object");
  const unexpected = shape(value, ["nodeIds", "edgeIds"]);
  if (unexpected) return fail("INVALID_SELECTION", `${path}.${unexpected}`, "selection shape is invalid");
  if (!Array.isArray(value.nodeIds) || !Array.isArray(value.edgeIds)) {
    return fail("INVALID_SELECTION", path, "selection nodeIds and edgeIds must be arrays");
  }
  if (value.nodeIds.length > VIRA_CANVAS_MAX_SELECTED_NODES) {
    return fail("SELECTION_LIMIT_EXCEEDED", `${path}.nodeIds`, `selected node limit is ${VIRA_CANVAS_MAX_SELECTED_NODES}`);
  }
  if (value.edgeIds.length > VIRA_CANVAS_MAX_SELECTED_EDGES) {
    return fail("SELECTION_LIMIT_EXCEEDED", `${path}.edgeIds`, `selected edge limit is ${VIRA_CANVAS_MAX_SELECTED_EDGES}`);
  }
  const graphNodes = new Set(graph.nodes.map((node) => node.id));
  const graphEdges = new Set(graph.edges.map((edge) => edge.id));
  const nodeIds: string[] = [];
  const edgeIds: string[] = [];
  const seenNodes = new Set<string>();
  const seenEdges = new Set<string>();

  for (let index = 0; index < value.nodeIds.length; index += 1) {
    const nodeId = value.nodeIds[index];
    const itemPath = `${path}.nodeIds[${index}]`;
    if (typeof nodeId !== "string" || !isSemanticSegment(nodeId)) {
      return fail("INVALID_SELECTION", itemPath, "selected node id must be a canonical graph-local semantic segment");
    }
    if (!graphNodes.has(nodeId)) return fail("SELECTION_TARGET_NOT_FOUND", itemPath, "selected node does not exist in the graph");
    if (seenNodes.has(nodeId)) return fail("DUPLICATE_SELECTION", itemPath, "duplicate selected node");
    seenNodes.add(nodeId);
    nodeIds.push(nodeId);
  }

  for (let index = 0; index < value.edgeIds.length; index += 1) {
    const edgeId = value.edgeIds[index];
    const itemPath = `${path}.edgeIds[${index}]`;
    if (typeof edgeId !== "string" || !isSemanticSegment(edgeId)) {
      return fail("INVALID_SELECTION", itemPath, "selected edge id must be a canonical graph-local semantic segment");
    }
    if (!graphEdges.has(edgeId)) return fail("SELECTION_TARGET_NOT_FOUND", itemPath, "selected edge does not exist in the graph");
    if (seenEdges.has(edgeId)) return fail("DUPLICATE_SELECTION", itemPath, "duplicate selected edge");
    seenEdges.add(edgeId);
    edgeIds.push(edgeId);
  }

  return {
    ok: true,
    value: Object.freeze({ nodeIds: Object.freeze(nodeIds), edgeIds: Object.freeze(edgeIds) }),
  };
}

function parseProjection(value: JsonValue | undefined, graphs: readonly ViraApplicationGraph[]): Parsed<ViraCanvasProjection> {
  if (!object(value)) return fail("INVALID_PROJECTION", "$.projection", "projection must be an exact object");
  const unexpected = shape(value, ["activeGraphRef", "graphViews"]);
  if (unexpected) return fail("INVALID_PROJECTION", `$.projection.${unexpected}`, "projection shape is invalid");

  const graphByKey = new Map(graphs.map((graph) => [`${graph.id}\u0000${graph.version}`, graph] as const));
  let activeGraphRef: ViraCanvasGraphRef | null = null;
  if (value.activeGraphRef !== null) {
    const active = parseGraphRef(value.activeGraphRef, "$.projection.activeGraphRef");
    if (!active.ok) return active;
    if (!graphByKey.has(graphKey(active.value))) {
      return fail("GRAPH_NOT_FOUND", "$.projection.activeGraphRef", "active graph is not present in Canvas semantics");
    }
    activeGraphRef = active.value;
  }

  if (!Array.isArray(value.graphViews)) return fail("INVALID_PROJECTION", "$.projection.graphViews", "graphViews must be an array");
  if (value.graphViews.length > VIRA_CANVAS_MAX_GRAPH_VIEWS) {
    return fail("GRAPH_VIEW_LIMIT_EXCEEDED", "$.projection.graphViews", `graph view limit is ${VIRA_CANVAS_MAX_GRAPH_VIEWS}`);
  }

  const views: ViraCanvasGraphView[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.graphViews.length; index += 1) {
    const path = `$.projection.graphViews[${index}]`;
    const item = value.graphViews[index] as JsonValue;
    if (!object(item)) return fail("INVALID_PROJECTION", path, "graph view must be an exact object");
    const viewUnexpected = shape(item, ["graphRef", "nodeLayouts", "viewport", "selection"]);
    if (viewUnexpected) return fail("INVALID_PROJECTION", `${path}.${viewUnexpected}`, "graph view shape is invalid");
    const ref = parseGraphRef(item.graphRef, `${path}.graphRef`);
    if (!ref.ok) return ref;
    const key = graphKey(ref.value);
    if (seen.has(key)) return fail("DUPLICATE_GRAPH_VIEW", `${path}.graphRef`, "duplicate graph projection view");
    const graph = graphByKey.get(key);
    if (!graph) return fail("GRAPH_NOT_FOUND", `${path}.graphRef`, "graph view targets a graph absent from Canvas semantics");
    const nodeLayouts = parseNodeLayouts(item.nodeLayouts, `${path}.nodeLayouts`, graph);
    if (!nodeLayouts.ok) return nodeLayouts;
    const viewport = parseViewport(item.viewport, `${path}.viewport`);
    if (!viewport.ok) return viewport;
    const selection = parseSelection(item.selection, `${path}.selection`, graph);
    if (!selection.ok) return selection;
    seen.add(key);
    views.push(Object.freeze({
      graphRef: ref.value,
      nodeLayouts: nodeLayouts.value,
      viewport: viewport.value,
      selection: selection.value,
    }));
  }

  return {
    ok: true,
    value: Object.freeze({ activeGraphRef, graphViews: Object.freeze(views) }),
  };
}

export function parseViraCanvasDraft(input: unknown): ViraCanvasDraftResult {
  const parsed = parseJsonValue(input, "$");
  if (!parsed.ok || !object(parsed.value)) {
    return fail(
      "INVALID_TYPE",
      parsed.ok ? "$" : parsed.issue.path,
      parsed.ok ? "Canvas draft must be a plain object" : parsed.issue.reason,
    );
  }

  const root = parsed.value;
  const unexpected = shape(root, ["schemaVersion", "draftId", "editorRevision", "semantics", "projection"]);
  if (unexpected) return fail("UNKNOWN_FIELD", `$.${unexpected}`, `unknown or missing Canvas draft field: ${unexpected}`);
  if (root.schemaVersion !== VIRA_CANVAS_DRAFT_SCHEMA_VERSION) {
    return fail("INVALID_SCHEMA_VERSION", "$.schemaVersion", `schemaVersion must equal ${VIRA_CANVAS_DRAFT_SCHEMA_VERSION}`);
  }
  if (
    typeof root.draftId !== "string"
    || root.draftId.length > VIRA_CANVAS_DRAFT_ID_MAX_LENGTH
    || !DRAFT_ID.test(root.draftId)
  ) {
    return fail("INVALID_DRAFT_ID", "$.draftId", "draftId must be a bounded opaque Canvas draft token");
  }
  if (
    typeof root.editorRevision !== "number"
    || !Number.isSafeInteger(root.editorRevision)
    || root.editorRevision < 0
  ) {
    return fail("INVALID_EDITOR_REVISION", "$.editorRevision", "editorRevision must be a non-negative safe integer");
  }

  const semantics = parseSemantics(root.semantics);
  if (!semantics.ok) return semantics;
  const projection = parseProjection(root.projection, semantics.value.graphs);
  if (!projection.ok) return projection;

  const value: ViraCanvasDraft = {
    schemaVersion: VIRA_CANVAS_DRAFT_SCHEMA_VERSION,
    draftId: root.draftId,
    editorRevision: root.editorRevision,
    semantics: semantics.value,
    projection: projection.value,
  };
  return { ok: true, value: freeze(value) };
}

export function serializeViraCanvasDraft(input: unknown): ViraCanvasDraftSerializationResult {
  const parsed = parseViraCanvasDraft(input);
  if (!parsed.ok) return parsed;
  return { ok: true, value: JSON.stringify(parsed.value), draft: parsed.value };
}

export function extractViraCanvasSemantics(input: unknown): ViraCanvasSemanticsResult {
  const parsed = parseViraCanvasDraft(input);
  if (!parsed.ok) return parsed;
  return { ok: true, value: parsed.value.semantics };
}

export function serializeViraCanvasSemantics(input: unknown): ViraCanvasSemanticsSerializationResult {
  const parsed = parseViraCanvasDraft(input);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    value: JSON.stringify(parsed.value.semantics),
    semantics: parsed.value.semantics,
  };
}
