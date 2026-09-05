import {
  parseViraCanvasDraftV2,
  serializeViraCanvasSemantics,
  serializeViraCanvasSemanticsV2,
  type ViraCanvasDraftV2,
} from "@vira-enterprise-genui/application-canvas";
import {
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import {
  replayViraCanvasSimulation,
  simulateViraCanvasScenario,
} from "./simulate.js";
import {
  VIRA_CANVAS_SIMULATION_MODE,
  type ViraCanvasSimulationIssue,
} from "./types.js";
import {
  VIRA_CANVAS_SIMULATION_V2_VERSION,
  type ViraCanvasSimulationReplayV2Result,
  type ViraCanvasSimulationTraceV2,
  type ViraCanvasSimulationV2Result,
} from "./v2-types.js";

type Failure = { readonly ok: false; readonly issue: ViraCanvasSimulationIssue };

function failure(code: ViraCanvasSimulationIssue["code"], path: string, message: string): Failure {
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

function projectApplicationV1(application: ViraCanvasDraftV2["semantics"]["application"]): unknown {
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

function projectGraphV1(graph: ViraCanvasDraftV2["semantics"]["graphs"][number]): unknown {
  return {
    schemaVersion: "1",
    id: graph.id,
    version: graph.version,
    publisher: graph.publisher,
    metadata: graph.metadata,
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      target: node.target.kind === "action"
        ? { kind: "action", actionType: node.target.ref.id }
        : node.target,
    })),
    edges: graph.edges,
  };
}

function projectDraftV1(draft: ViraCanvasDraftV2): unknown {
  return {
    schemaVersion: "1",
    draftId: draft.draftId,
    editorRevision: draft.editorRevision,
    semantics: {
      application: projectApplicationV1(draft.semantics.application),
      graphs: draft.semantics.graphs.map(projectGraphV1),
    },
    projection: draft.projection,
  };
}

function parseRoot(input: unknown, fields: readonly string[]):
  | { readonly ok: true; readonly value: JsonObject }
  | Failure {
  const parsed = parseJsonValue(input, "$");
  if (!parsed.ok || !object(parsed.value)) {
    return failure(
      "INVALID_INPUT",
      parsed.ok ? "$" : parsed.issue.path,
      parsed.ok ? "simulation V2 input must be an exact object" : parsed.issue.reason,
    );
  }
  const unexpected = shape(parsed.value, fields);
  if (unexpected) return failure("INVALID_INPUT", `$.${unexpected}`, "unknown or missing simulation V2 field");
  return { ok: true, value: parsed.value };
}

export function simulateViraCanvasScenarioV2(input: unknown): ViraCanvasSimulationV2Result {
  const root = parseRoot(input, ["draft", "scenario"]);
  if (!root.ok) return root;
  const draft = parseViraCanvasDraftV2(root.value.draft);
  if (!draft.ok) {
    return failure("INVALID_INPUT", `$.draft${draft.issue.path === "$" ? "" : draft.issue.path.slice(1)}`, draft.issue.message);
  }
  const legacy = simulateViraCanvasScenario({ draft: projectDraftV1(draft.value), scenario: root.value.scenario });
  if (!legacy.ok) return legacy;
  const snapshot = serializeViraCanvasSemanticsV2(draft.value);
  if (!snapshot.ok) return failure("INVALID_INPUT", "$.draft.semantics", snapshot.issue.message);

  const trace: ViraCanvasSimulationTraceV2 = Object.freeze({
    version: VIRA_CANVAS_SIMULATION_V2_VERSION,
    mode: VIRA_CANVAS_SIMULATION_MODE,
    scenarioId: legacy.value.scenarioId,
    sourceDraftId: draft.value.draftId,
    applicationRef: legacy.value.applicationRef,
    graphRef: legacy.value.graphRef,
    semanticsSnapshot: snapshot.value,
    frames: legacy.value.frames,
  });
  return { ok: true, value: trace };
}

export function replayViraCanvasSimulationV2(input: unknown): ViraCanvasSimulationReplayV2Result {
  const root = parseRoot(input, ["draft", "trace"]);
  if (!root.ok) return root;
  const draft = parseViraCanvasDraftV2(root.value.draft);
  if (!draft.ok) {
    return failure("INVALID_INPUT", `$.draft${draft.issue.path === "$" ? "" : draft.issue.path.slice(1)}`, draft.issue.message);
  }
  if (!object(root.value.trace)) return failure("INVALID_TRACE", "$.trace", "trace must be an exact object");
  const trace = root.value.trace;
  const unexpected = shape(trace, [
    "version",
    "mode",
    "scenarioId",
    "sourceDraftId",
    "applicationRef",
    "graphRef",
    "semanticsSnapshot",
    "frames",
  ]);
  if (unexpected) return failure("INVALID_TRACE", `$.trace.${unexpected}`, "trace V2 shape is invalid");
  if (trace.version !== VIRA_CANVAS_SIMULATION_V2_VERSION) {
    return failure("INVALID_TRACE", "$.trace.version", "trace V2 version is unsupported");
  }
  if (trace.mode !== VIRA_CANVAS_SIMULATION_MODE) {
    return failure("INVALID_TRACE", "$.trace.mode", "trace V2 must be explicitly marked dry-run");
  }
  if (typeof trace.semanticsSnapshot !== "string") {
    return failure("INVALID_TRACE", "$.trace.semanticsSnapshot", "trace V2 semanticsSnapshot must be canonical text");
  }

  const snapshot = serializeViraCanvasSemanticsV2(draft.value);
  if (!snapshot.ok) return failure("INVALID_INPUT", "$.draft.semantics", snapshot.issue.message);
  if (trace.semanticsSnapshot !== snapshot.value) {
    return failure("SEMANTIC_DRIFT", "$.trace.semanticsSnapshot", "current Canvas V2 semantics differ from the simulation trace snapshot");
  }

  const projectedDraft = projectDraftV1(draft.value);
  const legacySnapshot = serializeViraCanvasSemantics(projectedDraft);
  if (!legacySnapshot.ok) {
    return failure("INVALID_INPUT", "$.draft.semantics", legacySnapshot.issue.message);
  }
  const legacyTrace = {
    version: "1",
    mode: trace.mode,
    scenarioId: trace.scenarioId,
    sourceDraftId: trace.sourceDraftId,
    applicationRef: trace.applicationRef,
    graphRef: trace.graphRef,
    semanticsSnapshot: legacySnapshot.value,
    frames: trace.frames,
  };
  const replayed = replayViraCanvasSimulation({ draft: projectedDraft, trace: legacyTrace });
  if (!replayed.ok) return replayed;
  return {
    ok: true,
    value: Object.freeze({
      version: VIRA_CANVAS_SIMULATION_V2_VERSION,
      mode: VIRA_CANVAS_SIMULATION_MODE,
      scenarioId: replayed.value.scenarioId,
      applicationRef: replayed.value.applicationRef,
      graphRef: replayed.value.graphRef,
      frames: replayed.value.frames,
      matched: true,
    }),
  };
}
