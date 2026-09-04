import { parseJsonValue, type JsonObject, type JsonValue } from "@vira-enterprise-genui/protocol";
import type {
  ViraCanvasDraft,
  ViraCanvasGraphRef,
  ViraCanvasGraphView,
  ViraCanvasSemantics,
} from "./types.js";
import { parseViraCanvasDraft } from "./validate.js";

export type ViraCanvasSessionIssueCode =
  | "INVALID_INPUT"
  | "INVALID_MUTATION"
  | "STALE_REVISION"
  | "REVISION_EXHAUSTED"
  | "GRAPH_NOT_FOUND"
  | "GRAPH_VIEW_NOT_FOUND"
  | "MUTATION_FAILED";

export interface ViraCanvasSessionIssue {
  readonly code: ViraCanvasSessionIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraCanvasSessionMutationResult =
  | { readonly ok: true; readonly value: ViraCanvasDraft }
  | { readonly ok: false; readonly issue: ViraCanvasSessionIssue };

export interface ViraCanvasRevisionGuard {
  readonly expectedRevision: number;
}

export interface ViraCanvasReplaceSemanticsInput extends ViraCanvasRevisionGuard {
  readonly semantics: ViraCanvasSemantics;
}

export interface ViraCanvasSetActiveGraphInput extends ViraCanvasRevisionGuard {
  readonly graphRef: ViraCanvasGraphRef | null;
}

export interface ViraCanvasUpsertGraphViewInput extends ViraCanvasRevisionGuard {
  readonly graphView: ViraCanvasGraphView;
}

export interface ViraCanvasRemoveGraphViewInput extends ViraCanvasRevisionGuard {
  readonly graphRef: ViraCanvasGraphRef;
}

export interface ViraCanvasSetNodeLayoutInput extends ViraCanvasRevisionGuard {
  readonly graphRef: ViraCanvasGraphRef;
  readonly nodeId: string;
  readonly x: number;
  readonly y: number;
}

export interface ViraCanvasSetViewportInput extends ViraCanvasRevisionGuard {
  readonly graphRef: ViraCanvasGraphRef;
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export interface ViraCanvasSetSelectionInput extends ViraCanvasRevisionGuard {
  readonly graphRef: ViraCanvasGraphRef;
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
}

export interface ViraCanvasMutationSession {
  readonly currentDraft: () => ViraCanvasDraft;
  readonly replaceSemantics: (input: ViraCanvasReplaceSemanticsInput) => ViraCanvasSessionMutationResult;
  readonly setActiveGraph: (input: ViraCanvasSetActiveGraphInput) => ViraCanvasSessionMutationResult;
  readonly upsertGraphView: (input: ViraCanvasUpsertGraphViewInput) => ViraCanvasSessionMutationResult;
  readonly removeGraphView: (input: ViraCanvasRemoveGraphViewInput) => ViraCanvasSessionMutationResult;
  readonly setNodeLayout: (input: ViraCanvasSetNodeLayoutInput) => ViraCanvasSessionMutationResult;
  readonly setViewport: (input: ViraCanvasSetViewportInput) => ViraCanvasSessionMutationResult;
  readonly setSelection: (input: ViraCanvasSetSelectionInput) => ViraCanvasSessionMutationResult;
}

export type CreateViraCanvasMutationSessionResult =
  | { readonly ok: true; readonly value: ViraCanvasMutationSession }
  | { readonly ok: false; readonly issue: ViraCanvasSessionIssue };

type Failure = { readonly ok: false; readonly issue: ViraCanvasSessionIssue };
type Parsed<T> = { readonly ok: true; readonly value: T } | Failure;

function issue(code: ViraCanvasSessionIssueCode, path: string, message: string): ViraCanvasSessionIssue {
  return Object.freeze({ code, path, message });
}

function failure(code: ViraCanvasSessionIssueCode, path: string, message: string): Failure {
  return { ok: false, issue: issue(code, path, message) };
}

function object(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function shape(value: JsonObject, allowed: readonly string[]): string | undefined {
  const keys = new Set(allowed);
  return Object.keys(value).sort().find((key) => !keys.has(key))
    ?? allowed.find((key) => !Object.hasOwn(value, key));
}

function parseMutation(input: unknown, allowed: readonly string[]): Parsed<JsonObject> {
  const parsed = parseJsonValue(input, "$");
  if (!parsed.ok || !object(parsed.value)) {
    return failure(
      "INVALID_MUTATION",
      parsed.ok ? "$" : parsed.issue.path,
      parsed.ok ? "Canvas mutation input must be a plain object" : parsed.issue.reason,
    );
  }
  const unexpected = shape(parsed.value, allowed);
  if (unexpected) {
    return failure("INVALID_MUTATION", `$.${unexpected}`, `unknown or missing Canvas mutation field: ${unexpected}`);
  }
  return { ok: true, value: parsed.value };
}

function refKey(ref: ViraCanvasGraphRef): string {
  return `${ref.id}\u0000${ref.version}`;
}

export function createViraCanvasMutationSession(input: unknown): CreateViraCanvasMutationSessionResult {
  const initial = parseViraCanvasDraft(input);
  if (!initial.ok) {
    return {
      ok: false,
      issue: issue("INVALID_INPUT", initial.issue.path, initial.issue.message),
    };
  }

  let current = initial.value;

  function guard(value: JsonObject): Failure | undefined {
    const expected = value.expectedRevision;
    if (typeof expected !== "number" || !Number.isSafeInteger(expected) || expected < 0) {
      return failure("INVALID_MUTATION", "$.expectedRevision", "expectedRevision must be a non-negative safe integer");
    }
    if (expected !== current.editorRevision) {
      return failure(
        "STALE_REVISION",
        "$.expectedRevision",
        `expected editorRevision ${current.editorRevision}, received ${expected}`,
      );
    }
    return undefined;
  }

  function resolveGraphRef(value: JsonValue | undefined, path: string): Parsed<ViraCanvasGraphRef> {
    if (!object(value)) return failure("INVALID_MUTATION", path, "graphRef must be an exact object");
    const unexpected = shape(value, ["id", "version"]);
    if (unexpected) return failure("INVALID_MUTATION", `${path}.${unexpected}`, "graphRef shape is invalid");
    if (typeof value.id !== "string" || typeof value.version !== "string") {
      return failure("INVALID_MUTATION", path, "graphRef id and version must be strings");
    }
    const graph = current.semantics.graphs.find((candidate) => candidate.id === value.id && candidate.version === value.version);
    if (!graph) return failure("GRAPH_NOT_FOUND", path, "graphRef does not resolve to current Canvas semantics");
    return { ok: true, value: Object.freeze({ id: graph.id, version: graph.version }) };
  }

  function findView(ref: ViraCanvasGraphRef): { readonly index: number; readonly value: ViraCanvasGraphView } | undefined {
    const key = refKey(ref);
    const index = current.projection.graphViews.findIndex((view) => refKey(view.graphRef) === key);
    if (index < 0) return undefined;
    const value = current.projection.graphViews[index];
    return value === undefined ? undefined : { index, value };
  }

  function commit(candidate: Omit<ViraCanvasDraft, "editorRevision">): ViraCanvasSessionMutationResult {
    if (current.editorRevision === Number.MAX_SAFE_INTEGER) {
      return failure("REVISION_EXHAUSTED", "$.editorRevision", "Canvas editorRevision cannot be incremented safely");
    }
    const parsed = parseViraCanvasDraft({
      ...candidate,
      editorRevision: current.editorRevision + 1,
    });
    if (!parsed.ok) {
      return failure("MUTATION_FAILED", parsed.issue.path, parsed.issue.message);
    }
    current = parsed.value;
    return { ok: true, value: current };
  }

  const session: ViraCanvasMutationSession = {
    currentDraft: () => current,

    replaceSemantics: (inputValue) => {
      const parsed = parseMutation(inputValue, ["expectedRevision", "semantics"]);
      if (!parsed.ok) return parsed;
      const stale = guard(parsed.value);
      if (stale) return stale;
      return commit({
        schemaVersion: current.schemaVersion,
        draftId: current.draftId,
        semantics: parsed.value.semantics as unknown as ViraCanvasSemantics,
        projection: current.projection,
      });
    },

    setActiveGraph: (inputValue) => {
      const parsed = parseMutation(inputValue, ["expectedRevision", "graphRef"]);
      if (!parsed.ok) return parsed;
      const stale = guard(parsed.value);
      if (stale) return stale;
      let graphRef: ViraCanvasGraphRef | null = null;
      if (parsed.value.graphRef !== null) {
        const resolved = resolveGraphRef(parsed.value.graphRef, "$.graphRef");
        if (!resolved.ok) return resolved;
        graphRef = resolved.value;
      }
      return commit({
        schemaVersion: current.schemaVersion,
        draftId: current.draftId,
        semantics: current.semantics,
        projection: { ...current.projection, activeGraphRef: graphRef },
      });
    },

    upsertGraphView: (inputValue) => {
      const parsed = parseMutation(inputValue, ["expectedRevision", "graphView"]);
      if (!parsed.ok) return parsed;
      const stale = guard(parsed.value);
      if (stale) return stale;
      if (!object(parsed.value.graphView)) {
        return failure("INVALID_MUTATION", "$.graphView", "graphView must be an exact object");
      }
      const resolved = resolveGraphRef(parsed.value.graphView.graphRef, "$.graphView.graphRef");
      if (!resolved.ok) return resolved;
      const existing = findView(resolved.value);
      const graphViews = existing === undefined
        ? [...current.projection.graphViews, parsed.value.graphView]
        : current.projection.graphViews.map((view, index) => index === existing.index ? parsed.value.graphView : view);
      return commit({
        schemaVersion: current.schemaVersion,
        draftId: current.draftId,
        semantics: current.semantics,
        projection: { ...current.projection, graphViews: graphViews as unknown as readonly ViraCanvasGraphView[] },
      });
    },

    removeGraphView: (inputValue) => {
      const parsed = parseMutation(inputValue, ["expectedRevision", "graphRef"]);
      if (!parsed.ok) return parsed;
      const stale = guard(parsed.value);
      if (stale) return stale;
      const resolved = resolveGraphRef(parsed.value.graphRef, "$.graphRef");
      if (!resolved.ok) return resolved;
      const existing = findView(resolved.value);
      if (!existing) return failure("GRAPH_VIEW_NOT_FOUND", "$.graphRef", "graph view does not exist");
      const removedKey = refKey(resolved.value);
      const activeKey = current.projection.activeGraphRef === null ? null : refKey(current.projection.activeGraphRef);
      return commit({
        schemaVersion: current.schemaVersion,
        draftId: current.draftId,
        semantics: current.semantics,
        projection: {
          activeGraphRef: activeKey === removedKey ? null : current.projection.activeGraphRef,
          graphViews: current.projection.graphViews.filter((_, index) => index !== existing.index),
        },
      });
    },

    setNodeLayout: (inputValue) => {
      const parsed = parseMutation(inputValue, ["expectedRevision", "graphRef", "nodeId", "x", "y"]);
      if (!parsed.ok) return parsed;
      const stale = guard(parsed.value);
      if (stale) return stale;
      const resolved = resolveGraphRef(parsed.value.graphRef, "$.graphRef");
      if (!resolved.ok) return resolved;
      const existing = findView(resolved.value);
      if (!existing) return failure("GRAPH_VIEW_NOT_FOUND", "$.graphRef", "graph view does not exist");
      if (typeof parsed.value.nodeId !== "string" || typeof parsed.value.x !== "number" || typeof parsed.value.y !== "number") {
        return failure("INVALID_MUTATION", "$", "nodeId must be a string and x/y must be numbers");
      }
      const layoutIndex = existing.value.nodeLayouts.findIndex((layout) => layout.nodeId === parsed.value.nodeId);
      const nextLayout = { nodeId: parsed.value.nodeId, x: parsed.value.x, y: parsed.value.y };
      const nodeLayouts = layoutIndex < 0
        ? [...existing.value.nodeLayouts, nextLayout]
        : existing.value.nodeLayouts.map((layout, index) => index === layoutIndex ? nextLayout : layout);
      const graphViews = current.projection.graphViews.map((view, index) =>
        index === existing.index ? { ...view, nodeLayouts } : view,
      );
      return commit({
        schemaVersion: current.schemaVersion,
        draftId: current.draftId,
        semantics: current.semantics,
        projection: { ...current.projection, graphViews },
      });
    },

    setViewport: (inputValue) => {
      const parsed = parseMutation(inputValue, ["expectedRevision", "graphRef", "x", "y", "zoom"]);
      if (!parsed.ok) return parsed;
      const stale = guard(parsed.value);
      if (stale) return stale;
      const resolved = resolveGraphRef(parsed.value.graphRef, "$.graphRef");
      if (!resolved.ok) return resolved;
      const existing = findView(resolved.value);
      if (!existing) return failure("GRAPH_VIEW_NOT_FOUND", "$.graphRef", "graph view does not exist");
      if (typeof parsed.value.x !== "number" || typeof parsed.value.y !== "number" || typeof parsed.value.zoom !== "number") {
        return failure("INVALID_MUTATION", "$", "viewport x/y/zoom must be numbers");
      }
      const viewport = { x: parsed.value.x, y: parsed.value.y, zoom: parsed.value.zoom };
      const graphViews = current.projection.graphViews.map((view, index) =>
        index === existing.index ? { ...view, viewport } : view,
      );
      return commit({
        schemaVersion: current.schemaVersion,
        draftId: current.draftId,
        semantics: current.semantics,
        projection: { ...current.projection, graphViews },
      });
    },

    setSelection: (inputValue) => {
      const parsed = parseMutation(inputValue, ["expectedRevision", "graphRef", "nodeIds", "edgeIds"]);
      if (!parsed.ok) return parsed;
      const stale = guard(parsed.value);
      if (stale) return stale;
      const resolved = resolveGraphRef(parsed.value.graphRef, "$.graphRef");
      if (!resolved.ok) return resolved;
      const existing = findView(resolved.value);
      if (!existing) return failure("GRAPH_VIEW_NOT_FOUND", "$.graphRef", "graph view does not exist");
      if (!Array.isArray(parsed.value.nodeIds) || !Array.isArray(parsed.value.edgeIds)) {
        return failure("INVALID_MUTATION", "$", "selection nodeIds and edgeIds must be arrays");
      }
      const selection = { nodeIds: parsed.value.nodeIds, edgeIds: parsed.value.edgeIds };
      const graphViews = current.projection.graphViews.map((view, index) =>
        index === existing.index ? { ...view, selection } : view,
      );
      return commit({
        schemaVersion: current.schemaVersion,
        draftId: current.draftId,
        semantics: current.semantics,
        projection: { ...current.projection, graphViews: graphViews as readonly ViraCanvasGraphView[] },
      });
    },
  };

  return { ok: true, value: Object.freeze(session) };
}
