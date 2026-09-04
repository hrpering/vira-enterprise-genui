import {
  parseViraCanvasDraft,
  serializeViraCanvasSemantics,
  type ViraCanvasDraft,
  type ViraCanvasGraphRef,
  type ViraCanvasSemantics,
} from "@vira-enterprise-genui/application-canvas";
import {
  isSemanticNamespace,
  isSemanticSegment,
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import {
  VIRA_CANVAS_SIMULATION_MAX_ID_LENGTH,
  VIRA_CANVAS_SIMULATION_MAX_SEMANTICS_SNAPSHOT_LENGTH,
  VIRA_CANVAS_SIMULATION_MAX_STEPS,
  VIRA_CANVAS_SIMULATION_MODE,
  VIRA_CANVAS_SIMULATION_VERSION,
  type ViraCanvasSimulationFrame,
  type ViraCanvasSimulationIssue,
  type ViraCanvasSimulationIssueCode,
  type ViraCanvasSimulationReplay,
  type ViraCanvasSimulationReplayResult,
  type ViraCanvasSimulationResult,
  type ViraCanvasSimulationScenario,
  type ViraCanvasSimulationTrace,
} from "./types.js";

const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const RELEASE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const NODE_KINDS = new Set(["experience", "capability", "context", "action"] as const);

type Graph = ViraCanvasSemantics["graphs"][number];
type Node = Graph["nodes"][number];
type Edge = Graph["edges"][number];
type Failure = { readonly ok: false; readonly issue: ViraCanvasSimulationIssue };
type Parsed<T> = { readonly ok: true; readonly value: T } | Failure;

function issue(code: ViraCanvasSimulationIssueCode, path: string, message: string): ViraCanvasSimulationIssue {
  return Object.freeze({ code, path, message });
}

function failure(code: ViraCanvasSimulationIssueCode, path: string, message: string): Failure {
  return { ok: false, issue: issue(code, path, message) };
}

function object(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function shape(value: JsonObject, allowed: readonly string[], required: readonly string[] = allowed): string | undefined {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).sort().find((key) => !allowedKeys.has(key))
    ?? required.find((key) => !Object.hasOwn(value, key));
}

function boundedOpaqueId(value: JsonValue | undefined): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= VIRA_CANVAS_SIMULATION_MAX_ID_LENGTH
    && OPAQUE_ID.test(value);
}

function releaseVersion(value: JsonValue | undefined): value is string {
  return typeof value === "string" && value.length <= 64 && RELEASE_VERSION.test(value);
}

function parseExactInput(input: unknown, allowed: readonly string[], path: string): Parsed<JsonObject> {
  const parsed = parseJsonValue(input, path);
  if (!parsed.ok || !object(parsed.value)) {
    return failure(
      "INVALID_INPUT",
      parsed.ok ? path : parsed.issue.path,
      parsed.ok ? "simulation input must be an exact data object" : parsed.issue.reason,
    );
  }
  const unexpected = shape(parsed.value, allowed);
  if (unexpected) return failure("INVALID_INPUT", `${path}.${unexpected}`, "unknown or missing simulation input field");
  return { ok: true, value: parsed.value };
}

function parseGraphRef(value: JsonValue | undefined, path: string, code: "INVALID_SCENARIO" | "INVALID_TRACE"): Parsed<ViraCanvasGraphRef> {
  if (!object(value)) return failure(code, path, "graphRef must be an exact object");
  const unexpected = shape(value, ["id", "version"]);
  if (unexpected) return failure(code, `${path}.${unexpected}`, "graphRef shape is invalid");
  if (
    typeof value.id !== "string"
    || !isSemanticNamespace(value.id)
    || !value.id.includes(".")
    || !releaseVersion(value.version)
  ) {
    return failure(code, path, "graphRef must contain a canonical namespaced graph id and exact release semver");
  }
  return { ok: true, value: Object.freeze({ id: value.id, version: value.version }) };
}

function parseScenario(input: unknown): Parsed<ViraCanvasSimulationScenario> {
  const parsed = parseJsonValue(input, "$.scenario");
  if (!parsed.ok || !object(parsed.value)) {
    return failure(
      "INVALID_SCENARIO",
      parsed.ok ? "$.scenario" : parsed.issue.path,
      parsed.ok ? "scenario must be an exact object" : parsed.issue.reason,
    );
  }
  const root = parsed.value;
  const unexpected = shape(root, ["id", "graphRef", "startNodeId", "edgeIds"]);
  if (unexpected) return failure("INVALID_SCENARIO", `$.scenario.${unexpected}`, "scenario shape is invalid");
  if (!boundedOpaqueId(root.id)) return failure("INVALID_SCENARIO", "$.scenario.id", "scenario id is invalid");
  const graphRef = parseGraphRef(root.graphRef, "$.scenario.graphRef", "INVALID_SCENARIO");
  if (!graphRef.ok) return graphRef;
  if (typeof root.startNodeId !== "string" || !isSemanticSegment(root.startNodeId)) {
    return failure("INVALID_SCENARIO", "$.scenario.startNodeId", "startNodeId must be a canonical graph-local node id");
  }
  if (!Array.isArray(root.edgeIds)) return failure("INVALID_SCENARIO", "$.scenario.edgeIds", "edgeIds must be an array");
  if (root.edgeIds.length > VIRA_CANVAS_SIMULATION_MAX_STEPS) {
    return failure("STEP_LIMIT_EXCEEDED", "$.scenario.edgeIds", `simulation step limit is ${VIRA_CANVAS_SIMULATION_MAX_STEPS}`);
  }
  const edgeIds: string[] = [];
  for (let index = 0; index < root.edgeIds.length; index += 1) {
    const edgeId = root.edgeIds[index];
    if (typeof edgeId !== "string" || !isSemanticSegment(edgeId)) {
      return failure("INVALID_SCENARIO", `$.scenario.edgeIds[${index}]`, "edge id must be a canonical graph-local edge id");
    }
    edgeIds.push(edgeId);
  }
  return {
    ok: true,
    value: Object.freeze({
      id: root.id,
      graphRef: graphRef.value,
      startNodeId: root.startNodeId,
      edgeIds: Object.freeze(edgeIds),
    }),
  };
}

function findGraph(draft: ViraCanvasDraft, ref: ViraCanvasGraphRef): Graph | undefined {
  for (let index = 0; index < draft.semantics.graphs.length; index += 1) {
    const graph = draft.semantics.graphs[index];
    if (graph && graph.id === ref.id && graph.version === ref.version) return graph;
  }
  return undefined;
}

function frame(index: number, node: Node, viaEdgeId: string | null): ViraCanvasSimulationFrame {
  return Object.freeze({ index, nodeId: node.id, nodeKind: node.target.kind, viaEdgeId });
}

function walk(
  graph: Graph,
  startNodeId: string,
  edgeIds: readonly string[],
  pathPrefix: string,
): Parsed<readonly ViraCanvasSimulationFrame[]> {
  const nodes = new Map<string, Node>();
  const edges = new Map<string, Edge>();
  for (const node of graph.nodes) nodes.set(node.id, node);
  for (const edge of graph.edges) edges.set(edge.id, edge);

  let current = nodes.get(startNodeId);
  if (!current) return failure("NODE_NOT_FOUND", `${pathPrefix}.startNodeId`, "simulation start node does not exist in the selected graph");
  const frames: ViraCanvasSimulationFrame[] = [frame(0, current, null)];

  for (let index = 0; index < edgeIds.length; index += 1) {
    const edgeId = edgeIds[index]!;
    const edge = edges.get(edgeId);
    if (!edge) return failure("EDGE_NOT_FOUND", `${pathPrefix}.edgeIds[${index}]`, "simulation edge does not exist in the selected graph");
    if (edge.from !== current.id) {
      return failure(
        "EDGE_PATH_MISMATCH",
        `${pathPrefix}.edgeIds[${index}]`,
        `edge ${edge.id} starts at ${edge.from}, not current node ${current.id}`,
      );
    }
    const next = nodes.get(edge.to);
    if (!next) return failure("NODE_NOT_FOUND", `${pathPrefix}.edgeIds[${index}]`, "simulation edge target node does not exist");
    current = next;
    frames.push(frame(index + 1, current, edge.id));
  }
  return { ok: true, value: Object.freeze(frames) };
}

function semanticSnapshot(draft: ViraCanvasDraft): Parsed<string> {
  const serialized = serializeViraCanvasSemantics(draft);
  if (!serialized.ok) return failure("INVALID_INPUT", "$.draft", serialized.issue.message);
  if (serialized.value.length > VIRA_CANVAS_SIMULATION_MAX_SEMANTICS_SNAPSHOT_LENGTH) {
    return failure("INVALID_INPUT", "$.draft.semantics", "canonical semantics snapshot exceeds simulation evidence bound");
  }
  return { ok: true, value: serialized.value };
}

function parseFrame(value: JsonValue, path: string): Parsed<ViraCanvasSimulationFrame> {
  if (!object(value)) return failure("INVALID_TRACE", path, "trace frame must be an exact object");
  const unexpected = shape(value, ["index", "nodeId", "nodeKind", "viaEdgeId"]);
  if (unexpected) return failure("INVALID_TRACE", `${path}.${unexpected}`, "trace frame shape is invalid");
  if (typeof value.index !== "number" || !Number.isSafeInteger(value.index) || value.index < 0) {
    return failure("INVALID_TRACE", `${path}.index`, "trace frame index must be a non-negative safe integer");
  }
  if (typeof value.nodeId !== "string" || !isSemanticSegment(value.nodeId)) {
    return failure("INVALID_TRACE", `${path}.nodeId`, "trace frame nodeId is invalid");
  }
  if (typeof value.nodeKind !== "string" || !NODE_KINDS.has(value.nodeKind as ViraCanvasSimulationFrame["nodeKind"])) {
    return failure("INVALID_TRACE", `${path}.nodeKind`, "trace frame nodeKind is invalid");
  }
  if (value.viaEdgeId !== null && (typeof value.viaEdgeId !== "string" || !isSemanticSegment(value.viaEdgeId))) {
    return failure("INVALID_TRACE", `${path}.viaEdgeId`, "trace frame viaEdgeId is invalid");
  }
  return {
    ok: true,
    value: Object.freeze({
      index: value.index,
      nodeId: value.nodeId,
      nodeKind: value.nodeKind as ViraCanvasSimulationFrame["nodeKind"],
      viaEdgeId: value.viaEdgeId,
    }),
  };
}

function parseTrace(input: unknown): Parsed<ViraCanvasSimulationTrace> {
  const parsed = parseJsonValue(input, "$.trace");
  if (!parsed.ok || !object(parsed.value)) {
    return failure(
      "INVALID_TRACE",
      parsed.ok ? "$.trace" : parsed.issue.path,
      parsed.ok ? "trace must be an exact object" : parsed.issue.reason,
    );
  }
  const root = parsed.value;
  const unexpected = shape(root, ["version", "mode", "scenarioId", "sourceDraftId", "applicationRef", "graphRef", "semanticsSnapshot", "frames"]);
  if (unexpected) return failure("INVALID_TRACE", `$.trace.${unexpected}`, "trace shape is invalid");
  if (root.version !== VIRA_CANVAS_SIMULATION_VERSION) return failure("INVALID_TRACE", "$.trace.version", "trace version is unsupported");
  if (root.mode !== VIRA_CANVAS_SIMULATION_MODE) return failure("INVALID_TRACE", "$.trace.mode", "trace must be explicitly marked dry-run");
  if (!boundedOpaqueId(root.scenarioId) || !boundedOpaqueId(root.sourceDraftId)) {
    return failure("INVALID_TRACE", "$.trace", "trace identity is invalid");
  }
  if (!object(root.applicationRef)) return failure("INVALID_TRACE", "$.trace.applicationRef", "applicationRef must be exact object");
  const appUnexpected = shape(root.applicationRef, ["id", "version"]);
  if (appUnexpected) return failure("INVALID_TRACE", `$.trace.applicationRef.${appUnexpected}`, "applicationRef shape is invalid");
  if (
    typeof root.applicationRef.id !== "string"
    || !isSemanticNamespace(root.applicationRef.id)
    || !releaseVersion(root.applicationRef.version)
  ) {
    return failure("INVALID_TRACE", "$.trace.applicationRef", "applicationRef is invalid");
  }
  const graphRef = parseGraphRef(root.graphRef, "$.trace.graphRef", "INVALID_TRACE");
  if (!graphRef.ok) return graphRef;
  if (
    typeof root.semanticsSnapshot !== "string"
    || root.semanticsSnapshot.length < 2
    || root.semanticsSnapshot.length > VIRA_CANVAS_SIMULATION_MAX_SEMANTICS_SNAPSHOT_LENGTH
  ) {
    return failure("INVALID_TRACE", "$.trace.semanticsSnapshot", "semanticsSnapshot is invalid or exceeds the evidence bound");
  }
  if (!Array.isArray(root.frames) || root.frames.length < 1 || root.frames.length > VIRA_CANVAS_SIMULATION_MAX_STEPS + 1) {
    return failure("INVALID_TRACE", "$.trace.frames", "trace frames are missing or exceed simulation bounds");
  }

  const frames: ViraCanvasSimulationFrame[] = [];
  for (let index = 0; index < root.frames.length; index += 1) {
    const parsedFrame = parseFrame(root.frames[index] as JsonValue, `$.trace.frames[${index}]`);
    if (!parsedFrame.ok) return parsedFrame;
    if (parsedFrame.value.index !== index) {
      return failure("INVALID_TRACE", `$.trace.frames[${index}].index`, "trace frame indexes must be contiguous and zero-based");
    }
    if (index === 0 && parsedFrame.value.viaEdgeId !== null) {
      return failure("INVALID_TRACE", "$.trace.frames[0].viaEdgeId", "first trace frame must not name an incoming edge");
    }
    if (index > 0 && parsedFrame.value.viaEdgeId === null) {
      return failure("INVALID_TRACE", `$.trace.frames[${index}].viaEdgeId`, "non-initial trace frames must name their incoming edge");
    }
    frames.push(parsedFrame.value);
  }

  return {
    ok: true,
    value: Object.freeze({
      version: VIRA_CANVAS_SIMULATION_VERSION,
      mode: VIRA_CANVAS_SIMULATION_MODE,
      scenarioId: root.scenarioId,
      sourceDraftId: root.sourceDraftId,
      applicationRef: Object.freeze({ id: root.applicationRef.id, version: root.applicationRef.version }),
      graphRef: graphRef.value,
      semanticsSnapshot: root.semanticsSnapshot,
      frames: Object.freeze(frames),
    }),
  };
}

function sameFrames(left: readonly ViraCanvasSimulationFrame[], right: readonly ViraCanvasSimulationFrame[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (!a || !b || a.index !== b.index || a.nodeId !== b.nodeId || a.nodeKind !== b.nodeKind || a.viaEdgeId !== b.viaEdgeId) return false;
  }
  return true;
}

export function simulateViraCanvasScenario(input: unknown): ViraCanvasSimulationResult {
  const root = parseExactInput(input, ["draft", "scenario"], "$");
  if (!root.ok) return root;
  const draft = parseViraCanvasDraft(root.value.draft);
  if (!draft.ok) {
    return failure("INVALID_INPUT", `$.draft${draft.issue.path === "$" ? "" : draft.issue.path.slice(1)}`, draft.issue.message);
  }
  const scenario = parseScenario(root.value.scenario);
  if (!scenario.ok) return scenario;
  const graph = findGraph(draft.value, scenario.value.graphRef);
  if (!graph) return failure("GRAPH_NOT_FOUND", "$.scenario.graphRef", "selected simulation graph release does not exist in Canvas semantics");
  const frames = walk(graph, scenario.value.startNodeId, scenario.value.edgeIds, "$.scenario");
  if (!frames.ok) return frames;
  const snapshot = semanticSnapshot(draft.value);
  if (!snapshot.ok) return snapshot;

  const trace: ViraCanvasSimulationTrace = Object.freeze({
    version: VIRA_CANVAS_SIMULATION_VERSION,
    mode: VIRA_CANVAS_SIMULATION_MODE,
    scenarioId: scenario.value.id,
    sourceDraftId: draft.value.draftId,
    applicationRef: Object.freeze({
      id: draft.value.semantics.application.identity.id,
      version: draft.value.semantics.application.version,
    }),
    graphRef: scenario.value.graphRef,
    semanticsSnapshot: snapshot.value,
    frames: frames.value,
  });
  return { ok: true, value: trace };
}

export function replayViraCanvasSimulation(input: unknown): ViraCanvasSimulationReplayResult {
  const root = parseExactInput(input, ["draft", "trace"], "$");
  if (!root.ok) return root;
  const draft = parseViraCanvasDraft(root.value.draft);
  if (!draft.ok) {
    return failure("INVALID_INPUT", `$.draft${draft.issue.path === "$" ? "" : draft.issue.path.slice(1)}`, draft.issue.message);
  }
  const trace = parseTrace(root.value.trace);
  if (!trace.ok) return trace;
  const snapshot = semanticSnapshot(draft.value);
  if (!snapshot.ok) return snapshot;
  if (snapshot.value !== trace.value.semanticsSnapshot) {
    return failure("SEMANTIC_DRIFT", "$.trace.semanticsSnapshot", "current Canvas semantics differ from the simulation trace snapshot");
  }
  if (
    trace.value.applicationRef.id !== draft.value.semantics.application.identity.id
    || trace.value.applicationRef.version !== draft.value.semantics.application.version
  ) {
    return failure("INVALID_TRACE", "$.trace.applicationRef", "trace Application reference does not match its semantic snapshot");
  }
  const graph = findGraph(draft.value, trace.value.graphRef);
  if (!graph) return failure("INVALID_TRACE", "$.trace.graphRef", "trace graph release does not exist in its semantic snapshot");

  const start = trace.value.frames[0]!;
  const edgeIds: string[] = [];
  for (let index = 1; index < trace.value.frames.length; index += 1) {
    const edgeId = trace.value.frames[index]!.viaEdgeId;
    if (edgeId === null) return failure("INVALID_TRACE", `$.trace.frames[${index}].viaEdgeId`, "replay frame is missing incoming edge");
    edgeIds.push(edgeId);
  }
  const replayed = walk(graph, start.nodeId, edgeIds, "$.trace");
  if (!replayed.ok) return failure("INVALID_TRACE", replayed.issue.path, replayed.issue.message);
  if (!sameFrames(replayed.value, trace.value.frames)) {
    return failure("INVALID_TRACE", "$.trace.frames", "trace frames are inconsistent with the canonical graph path");
  }

  const replay: ViraCanvasSimulationReplay = Object.freeze({
    version: VIRA_CANVAS_SIMULATION_VERSION,
    mode: VIRA_CANVAS_SIMULATION_MODE,
    scenarioId: trace.value.scenarioId,
    applicationRef: trace.value.applicationRef,
    graphRef: trace.value.graphRef,
    frames: trace.value.frames,
    matched: true,
  });
  return { ok: true, value: replay };
}
