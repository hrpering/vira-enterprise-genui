import {
  isSemanticNamespace,
  isSemanticSegment,
  parseJsonValue,
} from "@vira-enterprise-genui/protocol";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import {
  STUDIO_DOCUMENT_VERSION,
  STUDIO_EVENT_MAX_LENGTH,
  STUDIO_MAX_BINDINGS,
  STUDIO_MAX_INTERACTIONS,
  STUDIO_MAX_NODES_PER_VIEW,
  STUDIO_MAX_VIEWS,
} from "./types.js";
import type {
  StudioBinding,
  StudioExperienceDocumentResult,
  StudioInteraction,
  StudioInteractionOutcome,
  StudioInteractionRoute,
  StudioNode,
  StudioValidationCode,
  StudioView,
} from "./types.js";

const rootFields = new Set(["version", "id", "recipeId", "entryView", "views", "bindings", "interactions"]);
const viewFields = new Set(["id", "nodes"]);
const nodeFields = new Set(["id", "component", "order", "props", "parentId", "slot"]);
const bindingFields = new Set(["viewId", "nodeId", "prop", "source"]);
const sourceFields = new Set(["kind", "path"]);
const interactionFields = new Set(["viewId", "nodeId", "event", "actionEvent", "routes"]);
const routeFields = new Set(["outcome", "viewId"]);
const outcomes = new Set<StudioInteractionOutcome>(["success", "empty", "error"]);
const propPattern = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const controlCharacterPattern = /[\u0000-\u001F\u007F]/;

function failure(code: StudioValidationCode, path: string, message: string): StudioExperienceDocumentResult {
  return { ok: false, issue: { code, path, message } };
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function unknownField(value: JsonObject, allowed: ReadonlySet<string>): string | undefined {
  return Object.keys(value).sort().find((field) => !allowed.has(field));
}

function validEvent(value: JsonValue | undefined): value is string {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= STUDIO_EVENT_MAX_LENGTH
    && value.trim() === value
    && !controlCharacterPattern.test(value);
}

function freezeStudioData<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) freezeStudioData(item);
    return Object.freeze(value);
  }
  const object = value as Record<string, unknown>;
  for (const key of Object.keys(object)) freezeStudioData(object[key]);
  return Object.freeze(value);
}

function preflight(input: unknown): StudioExperienceDocumentResult | undefined {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return undefined;
  for (const [field, limit, code] of [
    ["views", STUDIO_MAX_VIEWS, "VIEW_LIMIT_EXCEEDED"],
    ["bindings", STUDIO_MAX_BINDINGS, "BINDING_LIMIT_EXCEEDED"],
    ["interactions", STUDIO_MAX_INTERACTIONS, "INTERACTION_LIMIT_EXCEEDED"],
  ] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(input, field);
    if (!descriptor || !("value" in descriptor) || !Array.isArray(descriptor.value)) continue;
    if (descriptor.value.length > limit) return failure(code, `$.${field}`, `${field} exceeds the Studio v1 entry limit`);
  }
  return undefined;
}

function parseViews(raw: JsonValue | undefined):
  | { readonly ok: true; readonly views: readonly StudioView[]; readonly nodesByView: ReadonlyMap<string, ReadonlySet<string>> }
  | { readonly ok: false; readonly result: StudioExperienceDocumentResult } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, result: failure("INVALID_VIEWS", "$.views", "views must be a non-empty array") };
  }
  if (raw.length > STUDIO_MAX_VIEWS) {
    return { ok: false, result: failure("VIEW_LIMIT_EXCEEDED", "$.views", `Studio v1 allows at most ${STUDIO_MAX_VIEWS} views`) };
  }

  const views: StudioView[] = [];
  const viewIds = new Set<string>();
  const nodesByView = new Map<string, ReadonlySet<string>>();

  for (let viewIndex = 0; viewIndex < raw.length; viewIndex += 1) {
    const value = raw[viewIndex];
    const base = `$.views[${viewIndex}]`;
    if (!isJsonObject(value)) return { ok: false, result: failure("INVALID_VIEWS", base, "view must be a canonical JSON object") };
    const unknown = unknownField(value, viewFields);
    if (unknown) return { ok: false, result: failure("UNKNOWN_FIELD", `${base}.${unknown}`, `unknown Studio view field: ${unknown}`) };
    if (typeof value.id !== "string" || !isSemanticSegment(value.id)) {
      return { ok: false, result: failure("INVALID_VIEWS", `${base}.id`, "view id must be one semantic segment") };
    }
    if (viewIds.has(value.id)) return { ok: false, result: failure("DUPLICATE_VIEW", `${base}.id`, "duplicate Studio view id") };
    if (!Array.isArray(value.nodes) || value.nodes.length === 0) {
      return { ok: false, result: failure("INVALID_NODE", `${base}.nodes`, "view nodes must be a non-empty array") };
    }
    if (value.nodes.length > STUDIO_MAX_NODES_PER_VIEW) {
      return { ok: false, result: failure("NODE_LIMIT_EXCEEDED", `${base}.nodes`, `a Studio view allows at most ${STUDIO_MAX_NODES_PER_VIEW} nodes`) };
    }

    const nodes: StudioNode[] = [];
    const nodeIds = new Set<string>();
    const parentByNode = new Map<string, string | undefined>();
    const orderByScope = new Map<string, Set<number>>();

    for (let nodeIndex = 0; nodeIndex < value.nodes.length; nodeIndex += 1) {
      const nodeValue = value.nodes[nodeIndex];
      const nodeBase = `${base}.nodes[${nodeIndex}]`;
      if (!isJsonObject(nodeValue)) return { ok: false, result: failure("INVALID_NODE", nodeBase, "node must be a canonical JSON object") };
      const unknownNodeField = unknownField(nodeValue, nodeFields);
      if (unknownNodeField) return { ok: false, result: failure("UNKNOWN_FIELD", `${nodeBase}.${unknownNodeField}`, `unknown Studio node field: ${unknownNodeField}`) };
      if (typeof nodeValue.id !== "string" || !isSemanticSegment(nodeValue.id)) {
        return { ok: false, result: failure("INVALID_NODE", `${nodeBase}.id`, "node id must be one semantic segment") };
      }
      if (nodeIds.has(nodeValue.id)) return { ok: false, result: failure("DUPLICATE_NODE", `${nodeBase}.id`, "duplicate node id in view") };
      if (typeof nodeValue.component !== "string" || !nodeValue.component.includes(".") || !isSemanticNamespace(nodeValue.component)) {
        return { ok: false, result: failure("INVALID_COMPONENT_REFERENCE", `${nodeBase}.component`, "component must be a namespaced semantic reference") };
      }
      if (typeof nodeValue.order !== "number" || !Number.isSafeInteger(nodeValue.order) || nodeValue.order < 0) {
        return { ok: false, result: failure("INVALID_NODE_ORDER", `${nodeBase}.order`, "node order must be a non-negative safe integer") };
      }

      let props: JsonObject = {};
      if (Object.hasOwn(nodeValue, "props")) {
        if (!isJsonObject(nodeValue.props)) return { ok: false, result: failure("INVALID_PROPS", `${nodeBase}.props`, "node props must be a canonical JSON object") };
        props = nodeValue.props;
      }

      let parentId: string | undefined;
      let slot: string | undefined;
      if (Object.hasOwn(nodeValue, "parentId")) {
        if (typeof nodeValue.parentId !== "string" || !isSemanticSegment(nodeValue.parentId)) {
          return { ok: false, result: failure("INVALID_PARENT", `${nodeBase}.parentId`, "parentId must be one semantic segment") };
        }
        parentId = nodeValue.parentId;
        if (typeof nodeValue.slot !== "string" || !isSemanticSegment(nodeValue.slot)) {
          return { ok: false, result: failure("INVALID_PARENT", `${nodeBase}.slot`, "nested nodes require a semantic slot") };
        }
        slot = nodeValue.slot;
      } else if (Object.hasOwn(nodeValue, "slot")) {
        return { ok: false, result: failure("INVALID_PARENT", `${nodeBase}.slot`, "root nodes must not declare a slot") };
      }

      const scope = parentId === undefined ? "$root" : `${parentId}:${slot}`;
      const usedOrders = orderByScope.get(scope) ?? new Set<number>();
      if (usedOrders.has(nodeValue.order)) {
        return { ok: false, result: failure("DUPLICATE_NODE_ORDER", `${nodeBase}.order`, "sibling node order must be unique") };
      }
      usedOrders.add(nodeValue.order);
      orderByScope.set(scope, usedOrders);

      nodeIds.add(nodeValue.id);
      parentByNode.set(nodeValue.id, parentId);
      nodes.push({
        id: nodeValue.id,
        component: nodeValue.component,
        order: nodeValue.order,
        props,
        ...(parentId === undefined ? {} : { parentId, slot: slot as string }),
      });
    }

    for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
      const node = nodes[nodeIndex];
      if (!node) continue;
      if (node.parentId !== undefined && !nodeIds.has(node.parentId)) {
        return { ok: false, result: failure("INVALID_PARENT", `${base}.nodes[${nodeIndex}].parentId`, "parent node does not exist in this view") };
      }
      if (node.parentId === node.id) {
        return { ok: false, result: failure("NODE_CYCLE", `${base}.nodes[${nodeIndex}].parentId`, "node cannot parent itself") };
      }
      const seen = new Set<string>([node.id]);
      let current = node.parentId;
      while (current !== undefined) {
        if (seen.has(current)) {
          return { ok: false, result: failure("NODE_CYCLE", `${base}.nodes[${nodeIndex}].parentId`, "node parent graph must be acyclic") };
        }
        seen.add(current);
        current = parentByNode.get(current);
      }
    }

    viewIds.add(value.id);
    nodesByView.set(value.id, nodeIds);
    views.push({ id: value.id, nodes });
  }

  return { ok: true, views, nodesByView };
}

function parseBindings(
  raw: JsonValue | undefined,
  nodesByView: ReadonlyMap<string, ReadonlySet<string>>,
): { readonly ok: true; readonly bindings: readonly StudioBinding[] } | { readonly ok: false; readonly result: StudioExperienceDocumentResult } {
  if (raw === undefined) return { ok: true, bindings: [] };
  if (!Array.isArray(raw)) return { ok: false, result: failure("INVALID_BINDING", "$.bindings", "bindings must be an array") };
  if (raw.length > STUDIO_MAX_BINDINGS) return { ok: false, result: failure("BINDING_LIMIT_EXCEEDED", "$.bindings", `Studio v1 allows at most ${STUDIO_MAX_BINDINGS} bindings`) };

  const bindings: StudioBinding[] = [];
  const targets = new Set<string>();
  for (let index = 0; index < raw.length; index += 1) {
    const value = raw[index];
    const base = `$.bindings[${index}]`;
    if (!isJsonObject(value)) return { ok: false, result: failure("INVALID_BINDING", base, "binding must be a canonical JSON object") };
    const unknown = unknownField(value, bindingFields);
    if (unknown) return { ok: false, result: failure("UNKNOWN_FIELD", `${base}.${unknown}`, `unknown Studio binding field: ${unknown}`) };
    if (typeof value.viewId !== "string" || !nodesByView.has(value.viewId)) return { ok: false, result: failure("INVALID_BINDING", `${base}.viewId`, "binding view does not exist") };
    if (typeof value.nodeId !== "string" || !nodesByView.get(value.viewId)?.has(value.nodeId)) return { ok: false, result: failure("INVALID_BINDING", `${base}.nodeId`, "binding node does not exist in the referenced view") };
    if (typeof value.prop !== "string" || !propPattern.test(value.prop)) return { ok: false, result: failure("INVALID_BINDING", `${base}.prop`, "binding prop must be a safe property key") };
    if (!isJsonObject(value.source)) return { ok: false, result: failure("INVALID_BINDING", `${base}.source`, "binding source must be a canonical JSON object") };
    const unknownSource = unknownField(value.source, sourceFields);
    if (unknownSource) return { ok: false, result: failure("UNKNOWN_FIELD", `${base}.source.${unknownSource}`, `unknown Studio binding source field: ${unknownSource}`) };
    if (value.source.kind !== "state" && value.source.kind !== "domain") return { ok: false, result: failure("INVALID_BINDING", `${base}.source.kind`, "binding source kind must be state or domain") };
    if (typeof value.source.path !== "string" || !isSemanticNamespace(value.source.path)) return { ok: false, result: failure("INVALID_BINDING", `${base}.source.path`, "binding source path must be a semantic namespace") };
    const target = `${value.viewId}:${value.nodeId}:${value.prop}`;
    if (targets.has(target)) return { ok: false, result: failure("DUPLICATE_BINDING", base, "one node prop may have at most one Studio binding") };
    targets.add(target);
    bindings.push({
      viewId: value.viewId,
      nodeId: value.nodeId,
      prop: value.prop,
      source: { kind: value.source.kind, path: value.source.path },
    });
  }
  return { ok: true, bindings };
}

function parseInteractions(
  raw: JsonValue | undefined,
  nodesByView: ReadonlyMap<string, ReadonlySet<string>>,
): { readonly ok: true; readonly interactions: readonly StudioInteraction[] } | { readonly ok: false; readonly result: StudioExperienceDocumentResult } {
  if (raw === undefined) return { ok: true, interactions: [] };
  if (!Array.isArray(raw)) return { ok: false, result: failure("INVALID_INTERACTION", "$.interactions", "interactions must be an array") };
  if (raw.length > STUDIO_MAX_INTERACTIONS) return { ok: false, result: failure("INTERACTION_LIMIT_EXCEEDED", "$.interactions", `Studio v1 allows at most ${STUDIO_MAX_INTERACTIONS} interactions`) };

  const interactions: StudioInteraction[] = [];
  const identities = new Set<string>();
  for (let index = 0; index < raw.length; index += 1) {
    const value = raw[index];
    const base = `$.interactions[${index}]`;
    if (!isJsonObject(value)) return { ok: false, result: failure("INVALID_INTERACTION", base, "interaction must be a canonical JSON object") };
    const unknown = unknownField(value, interactionFields);
    if (unknown) return { ok: false, result: failure("UNKNOWN_FIELD", `${base}.${unknown}`, `unknown Studio interaction field: ${unknown}`) };
    if (typeof value.viewId !== "string" || !nodesByView.has(value.viewId)) return { ok: false, result: failure("INVALID_INTERACTION", `${base}.viewId`, "interaction view does not exist") };
    if (typeof value.nodeId !== "string" || !nodesByView.get(value.viewId)?.has(value.nodeId)) return { ok: false, result: failure("INVALID_INTERACTION", `${base}.nodeId`, "interaction node does not exist in the referenced view") };
    if (!validEvent(value.event)) return { ok: false, result: failure("INVALID_INTERACTION", `${base}.event`, `event must be a trimmed string of at most ${STUDIO_EVENT_MAX_LENGTH} characters`) };
    if (!validEvent(value.actionEvent)) return { ok: false, result: failure("INVALID_INTERACTION", `${base}.actionEvent`, `actionEvent must be a trimmed string of at most ${STUDIO_EVENT_MAX_LENGTH} characters`) };
    const identity = `${value.viewId}:${value.nodeId}:${value.event}`;
    if (identities.has(identity)) return { ok: false, result: failure("DUPLICATE_INTERACTION", base, "one node event may have at most one Studio interaction") };

    const rawRoutes = value.routes ?? [];
    if (!Array.isArray(rawRoutes) || rawRoutes.length > outcomes.size) return { ok: false, result: failure("INVALID_ROUTE", `${base}.routes`, "routes must contain at most one success, empty, and error route") };
    const routes: StudioInteractionRoute[] = [];
    const seenOutcomes = new Set<StudioInteractionOutcome>();
    for (let routeIndex = 0; routeIndex < rawRoutes.length; routeIndex += 1) {
      const route = rawRoutes[routeIndex];
      const routeBase = `${base}.routes[${routeIndex}]`;
      if (!isJsonObject(route)) return { ok: false, result: failure("INVALID_ROUTE", routeBase, "route must be a canonical JSON object") };
      const unknownRoute = unknownField(route, routeFields);
      if (unknownRoute) return { ok: false, result: failure("UNKNOWN_FIELD", `${routeBase}.${unknownRoute}`, `unknown Studio route field: ${unknownRoute}`) };
      if (typeof route.outcome !== "string" || !outcomes.has(route.outcome as StudioInteractionOutcome)) return { ok: false, result: failure("INVALID_ROUTE", `${routeBase}.outcome`, "route outcome must be success, empty, or error") };
      const outcome = route.outcome as StudioInteractionOutcome;
      if (seenOutcomes.has(outcome)) return { ok: false, result: failure("INVALID_ROUTE", `${routeBase}.outcome`, "duplicate route outcome") };
      if (typeof route.viewId !== "string" || !nodesByView.has(route.viewId)) return { ok: false, result: failure("INVALID_ROUTE", `${routeBase}.viewId`, "route target view does not exist") };
      seenOutcomes.add(outcome);
      routes.push({ outcome, viewId: route.viewId });
    }

    identities.add(identity);
    interactions.push({
      viewId: value.viewId,
      nodeId: value.nodeId,
      event: value.event,
      actionEvent: value.actionEvent,
      routes,
    });
  }
  return { ok: true, interactions };
}

export function parseStudioExperienceDocument(input: unknown): StudioExperienceDocumentResult {
  const preflightResult = preflight(input);
  if (preflightResult) return preflightResult;

  const parsed = parseJsonValue(input);
  if (!parsed.ok) return failure("INVALID_TYPE", parsed.issue.path, parsed.issue.reason);
  if (!isJsonObject(parsed.value)) return failure("INVALID_TYPE", "$", "Studio document must be a canonical JSON object");
  const fields = parsed.value;

  const unknown = unknownField(fields, rootFields);
  if (unknown) return failure("UNKNOWN_FIELD", `$.${unknown}`, `unknown Studio document field: ${unknown}`);
  if (fields.version !== STUDIO_DOCUMENT_VERSION) return failure("INVALID_VERSION", "$.version", `Studio document version must be ${STUDIO_DOCUMENT_VERSION}`);
  if (typeof fields.id !== "string" || !isSemanticNamespace(fields.id)) return failure("INVALID_ID", "$.id", "Studio experience id must be a semantic namespace");
  if (typeof fields.recipeId !== "string" || !isSemanticNamespace(fields.recipeId)) return failure("INVALID_RECIPE_ID", "$.recipeId", "recipeId must be a semantic namespace");
  if (typeof fields.entryView !== "string" || !isSemanticSegment(fields.entryView)) return failure("INVALID_ENTRY_VIEW", "$.entryView", "entryView must be one semantic segment");

  const views = parseViews(fields.views);
  if (!views.ok) return views.result;
  if (!views.nodesByView.has(fields.entryView)) return failure("INVALID_ENTRY_VIEW", "$.entryView", "entryView must reference an existing Studio view");

  const bindings = parseBindings(fields.bindings, views.nodesByView);
  if (!bindings.ok) return bindings.result;
  const interactions = parseInteractions(fields.interactions, views.nodesByView);
  if (!interactions.ok) return interactions.result;

  return {
    ok: true,
    value: freezeStudioData({
      version: STUDIO_DOCUMENT_VERSION,
      id: fields.id,
      recipeId: fields.recipeId,
      entryView: fields.entryView,
      views: [...views.views],
      bindings: [...bindings.bindings],
      interactions: [...interactions.interactions],
    }),
  };
}
