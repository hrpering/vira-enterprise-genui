import {
  parseViraApplicationGraphV2,
  type ViraApplicationGraphV2,
} from "@vira-enterprise-genui/application-graph";
import {
  parseViraApplicationPackageV2,
  type ViraApplicationPackageV2,
} from "@vira-enterprise-genui/application-package";
import {
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import {
  VIRA_CANVAS_MAX_GRAPHS,
  type ViraCanvasValidationCode,
  type ViraCanvasValidationIssue,
} from "./types.js";
import { parseViraCanvasDraft } from "./validate.js";
import {
  VIRA_CANVAS_DRAFT_V2_SCHEMA_VERSION,
  type ViraCanvasDraftV2,
  type ViraCanvasDraftV2Result,
  type ViraCanvasDraftV2SerializationResult,
  type ViraCanvasSemanticsV2Result,
  type ViraCanvasSemanticsV2SerializationResult,
} from "./v2-types.js";

type Failure = { readonly ok: false; readonly issue: ViraCanvasValidationIssue };

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

function projectApplicationV1(application: ViraApplicationPackageV2): unknown {
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

function projectGraphV1(graph: ViraApplicationGraphV2): unknown {
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

function validateActionClosure(
  application: ViraApplicationPackageV2,
  graphs: readonly ViraApplicationGraphV2[],
): Failure | null {
  const declared = new Set(application.actions.map((ref) => `${ref.id}\u0000${ref.versionRef}`));
  for (let graphIndex = 0; graphIndex < graphs.length; graphIndex += 1) {
    const graph = graphs[graphIndex]!;
    for (let nodeIndex = 0; nodeIndex < graph.nodes.length; nodeIndex += 1) {
      const node = graph.nodes[nodeIndex]!;
      if (node.target.kind !== "action") continue;
      const key = `${node.target.ref.id}\u0000${node.target.ref.versionRef}`;
      if (!declared.has(key)) {
        return fail(
          "INVALID_GRAPH",
          `$.semantics.graphs[${graphIndex}].nodes[${nodeIndex}].target.ref`,
          "ApplicationGraph V2 Action ref must exactly match one Action declared by Application V2",
        );
      }
    }
  }
  return null;
}

export function parseViraCanvasDraftV2(input: unknown): ViraCanvasDraftV2Result {
  const parsed = parseJsonValue(input, "$");
  if (!parsed.ok || !object(parsed.value)) {
    return fail(
      "INVALID_TYPE",
      parsed.ok ? "$" : parsed.issue.path,
      parsed.ok ? "Canvas V2 draft must be a plain object" : parsed.issue.reason,
    );
  }
  const root = parsed.value;
  const unexpected = shape(root, ["schemaVersion", "draftId", "editorRevision", "semantics", "projection"]);
  if (unexpected) return fail("UNKNOWN_FIELD", `$.${unexpected}`, `unknown or missing Canvas V2 field: ${unexpected}`);
  if (root.schemaVersion !== VIRA_CANVAS_DRAFT_V2_SCHEMA_VERSION) {
    return fail("INVALID_SCHEMA_VERSION", "$.schemaVersion", `schemaVersion must equal ${VIRA_CANVAS_DRAFT_V2_SCHEMA_VERSION}`);
  }
  if (!object(root.semantics)) return fail("INVALID_SEMANTICS", "$.semantics", "semantics must be an exact object");
  const semanticsUnexpected = shape(root.semantics, ["application", "graphs"]);
  if (semanticsUnexpected) {
    return fail("INVALID_SEMANTICS", `$.semantics.${semanticsUnexpected}`, "Canvas V2 semantics shape is invalid");
  }

  const application = parseViraApplicationPackageV2(root.semantics.application);
  if (!application.ok) {
    return fail("INVALID_APPLICATION", nestedPath("$.semantics.application", application.issue.path), application.issue.message);
  }
  if (!Array.isArray(root.semantics.graphs)) return fail("INVALID_GRAPH", "$.semantics.graphs", "graphs must be an array");
  if (root.semantics.graphs.length > VIRA_CANVAS_MAX_GRAPHS) {
    return fail("GRAPH_LIMIT_EXCEEDED", "$.semantics.graphs", `graph limit is ${VIRA_CANVAS_MAX_GRAPHS}`);
  }

  const graphs: ViraApplicationGraphV2[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < root.semantics.graphs.length; index += 1) {
    const graph = parseViraApplicationGraphV2(root.semantics.graphs[index]);
    const path = `$.semantics.graphs[${index}]`;
    if (!graph.ok) return fail("INVALID_GRAPH", nestedPath(path, graph.issue.path), graph.issue.message);
    const key = `${graph.value.id}\u0000${graph.value.version}`;
    if (seen.has(key)) return fail("DUPLICATE_GRAPH", path, "duplicate exact ApplicationGraph V2 release");
    seen.add(key);
    graphs.push(graph.value);
  }

  const closure = validateActionClosure(application.value, graphs);
  if (closure) return closure;

  const shared = parseViraCanvasDraft({
    schemaVersion: "1",
    draftId: root.draftId,
    editorRevision: root.editorRevision,
    semantics: {
      application: projectApplicationV1(application.value),
      graphs: graphs.map(projectGraphV1),
    },
    projection: root.projection,
  });
  if (!shared.ok) return shared;

  const value: ViraCanvasDraftV2 = Object.freeze({
    schemaVersion: VIRA_CANVAS_DRAFT_V2_SCHEMA_VERSION,
    draftId: shared.value.draftId,
    editorRevision: shared.value.editorRevision,
    semantics: Object.freeze({
      application: application.value,
      graphs: Object.freeze(graphs),
    }),
    projection: shared.value.projection,
  });
  return { ok: true, value };
}

export function serializeViraCanvasDraftV2(input: unknown): ViraCanvasDraftV2SerializationResult {
  const parsed = parseViraCanvasDraftV2(input);
  if (!parsed.ok) return parsed;
  return { ok: true, value: JSON.stringify(parsed.value), draft: parsed.value };
}

export function extractViraCanvasSemanticsV2(input: unknown): ViraCanvasSemanticsV2Result {
  const parsed = parseViraCanvasDraftV2(input);
  if (!parsed.ok) return parsed;
  return { ok: true, value: parsed.value.semantics };
}

export function serializeViraCanvasSemanticsV2(input: unknown): ViraCanvasSemanticsV2SerializationResult {
  const parsed = parseViraCanvasDraftV2(input);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    value: JSON.stringify(parsed.value.semantics),
    semantics: parsed.value.semantics,
  };
}
