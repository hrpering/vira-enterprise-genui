import { parseJsonValue } from "@vira-enterprise-genui/protocol";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import { createStateBindingSession } from "@vira-enterprise-genui/runtime-web";
import type { RuntimeWebActionIdFactory } from "@vira-enterprise-genui/runtime-web";
import { createStudioComponentCatalog } from "@vira-enterprise-genui/studio-catalog";
import type { StudioCatalogPropDefinition } from "@vira-enterprise-genui/studio-catalog";
import type { StudioPublication } from "@vira-enterprise-genui/studio-compiler";
import { prepareStudioPublication } from "@vira-enterprise-genui/studio-publish";
import type { StudioBindingSource, StudioInteractionRoute } from "@vira-enterprise-genui/studio-schema";
import type {
  CreateStudioRuntimeSessionResult,
  StudioRuntimeCompletionResult,
  StudioRuntimeDataPort,
  StudioRuntimeDispatchResult,
  StudioRuntimeIssue,
  StudioRuntimePorts,
  StudioRuntimeSession,
  StudioRuntimeValidationCode,
  StudioRuntimeViewResult,
} from "./types.js";

const inputFields = new Set(["publication", "componentCatalog", "bindingSourceCatalog", "actionAdapter", "runtimeState", "permissionPolicy"]);
const outcomes = new Set(["success", "empty", "error"]);

function issue(code: StudioRuntimeValidationCode, path: string, message: string): StudioRuntimeIssue {
  return Object.freeze({ code, path, message });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function readDataObject(value: unknown): { readonly ok: true; readonly value: Readonly<Record<string, unknown>> } | { readonly ok: false; readonly issue: StudioRuntimeIssue } {
  if (!isPlainObject(value) || Object.getOwnPropertySymbols(value).length > 0) return { ok: false, issue: issue("INVALID_INPUT", "$", "Studio runtime input must be a plain data object") };
  const keys = Object.keys(value);
  if (Object.getOwnPropertyNames(value).length !== keys.length) return { ok: false, issue: issue("INVALID_INPUT", "$", "Studio runtime input must not contain non-enumerable fields") };
  const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) return { ok: false, issue: issue("INVALID_INPUT", `$.${key}`, "Studio runtime input must not contain accessor fields") };
    output[key] = descriptor.value;
  }
  return { ok: true, value: output };
}

function readFunction(object: unknown, field: string): ((...args: readonly unknown[]) => unknown) | undefined {
  if (!isPlainObject(object)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(object, field);
  return descriptor && "value" in descriptor && typeof descriptor.value === "function"
    ? descriptor.value as (...args: readonly unknown[]) => unknown
    : undefined;
}

function sameData(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) if (!sameData(left[index], right[index])) return false;
    return true;
  }
  const leftObject = left as Record<string, unknown>;
  const rightObject = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftObject).sort();
  const rightKeys = Object.keys(rightObject).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  for (let index = 0; index < leftKeys.length; index += 1) {
    const key = leftKeys[index];
    if (!key || key !== rightKeys[index] || !sameData(leftObject[key], rightObject[key])) return false;
  }
  return true;
}

function freezeData<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) freezeData(item);
    return Object.freeze(value);
  }
  const object = value as Record<string, unknown>;
  for (const key of Object.keys(object)) freezeData(object[key]);
  return Object.freeze(value);
}

function propAccepts(definition: StudioCatalogPropDefinition, value: JsonValue): boolean {
  switch (definition.type) {
    case "string": return typeof value === "string";
    case "number": return typeof value === "number";
    case "boolean": return typeof value === "boolean";
    case "enum": return typeof value === "string" && (definition.options?.includes(value) ?? false);
  }
}

function validatePorts(ports: StudioRuntimePorts):
  | { readonly ok: true; readonly read: StudioRuntimeDataPort["read"]; readonly idFactory: RuntimeWebActionIdFactory }
  | { readonly ok: false; readonly issue: StudioRuntimeIssue } {
  if (!isPlainObject(ports)) return { ok: false, issue: issue("INVALID_PORTS", "$.ports", "Studio runtime ports must be a plain object") };
  const dataDescriptor = Object.getOwnPropertyDescriptor(ports, "data");
  const actionDescriptor = Object.getOwnPropertyDescriptor(ports, "actionIds");
  if (!dataDescriptor || !("value" in dataDescriptor) || !actionDescriptor || !("value" in actionDescriptor)) {
    return { ok: false, issue: issue("INVALID_PORTS", "$.ports", "Studio runtime ports require data and actionIds") };
  }
  const read = readFunction(dataDescriptor.value, "read");
  const nextId = readFunction(actionDescriptor.value, "nextId");
  if (!read || !nextId) return { ok: false, issue: issue("INVALID_PORTS", "$.ports", "Studio runtime ports require data.read and actionIds.nextId functions") };
  return {
    ok: true,
    read: (source: StudioBindingSource) => read(source),
    idFactory: Object.freeze({ nextId: () => nextId() as string }),
  };
}

function canonicalPublication(fields: Readonly<Record<string, unknown>>):
  | { readonly ok: true; readonly value: StudioPublication }
  | { readonly ok: false; readonly issue: StudioRuntimeIssue } {
  const parsed = parseJsonValue(fields.publication, "$.publication");
  if (!parsed.ok || parsed.value === null || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    return { ok: false, issue: issue("INVALID_PUBLICATION", parsed.ok ? "$.publication" : parsed.issue.path, "Studio publication must be canonical JSON data") };
  }
  const publicationObject = parsed.value as JsonObject;
  const rebuilt = prepareStudioPublication({
    document: publicationObject.document,
    componentCatalog: fields.componentCatalog,
    bindingSourceCatalog: fields.bindingSourceCatalog,
    actionAdapter: fields.actionAdapter,
  });
  if (!rebuilt.ok) return { ok: false, issue: issue("INVALID_PUBLICATION", rebuilt.issue.path, rebuilt.issue.message) };
  if (!sameData(publicationObject, rebuilt.value)) return { ok: false, issue: issue("FORGED_PUBLICATION", "$.publication", "Studio publication does not match the canonical compilation of its document") };
  return { ok: true, value: rebuilt.value };
}

export function createStudioRuntimeSession(input: unknown, portsInput: StudioRuntimePorts): CreateStudioRuntimeSessionResult {
  const root = readDataObject(input);
  if (!root.ok) return root;
  const fields = root.value;
  const unknown = Object.keys(fields).sort().find((field) => !inputFields.has(field));
  if (unknown) return { ok: false, issue: issue("INVALID_INPUT", `$.${unknown}`, "unknown Studio runtime session field") };
  const ports = validatePorts(portsInput);
  if (!ports.ok) return ports;
  const portsValue = ports;
  const publication = canonicalPublication(fields);
  if (!publication.ok) return publication;
  const publicationValue = publication.value;
  const catalog = createStudioComponentCatalog(fields.componentCatalog);
  if (!catalog.ok) return { ok: false, issue: issue("INVALID_PUBLICATION", "$.componentCatalog", catalog.issue.message) };
  const runtime = createStateBindingSession({
    state: fields.runtimeState,
    policy: fields.permissionPolicy,
    actionAdapter: fields.actionAdapter,
  }, portsValue.idFactory);
  if (!runtime.ok) return { ok: false, issue: issue("INVALID_RUNTIME_SESSION", runtime.issue.path, runtime.issue.message) };
  const runtimeValue = runtime.value;

  const components = new Map(catalog.value.components.map((component) => [component.ref, component] as const));
  let currentViewId = publicationValue.entryView;
  let pending: { readonly actionId: string; readonly routes: readonly StudioInteractionRoute[] } | undefined;
  let disposed = false;

  function currentView(): StudioRuntimeViewResult {
    if (disposed) return { ok: false, issue: issue("SESSION_DISPOSED", "$", "Studio runtime session is disposed") };
    const view = publicationValue.document.views.find((candidate) => candidate.id === currentViewId);
    if (!view) return { ok: false, issue: issue("VIEW_NOT_FOUND", "$.viewId", "current Studio view does not exist") };
    const bindingsByNode = new Map<string, typeof publicationValue.document.bindings>();
    for (const binding of publicationValue.document.bindings) {
      if (binding.viewId !== currentViewId) continue;
      const existing = bindingsByNode.get(binding.nodeId) ?? [];
      bindingsByNode.set(binding.nodeId, [...existing, binding]);
    }
    const nodes = [];
    for (const node of view.nodes) {
      const component = components.get(node.component);
      if (!component) return { ok: false, issue: issue("INVALID_PUBLICATION", "$.publication.document", "published component metadata is unavailable") };
      const props: Record<string, JsonValue> = { ...node.props };
      for (const binding of bindingsByNode.get(node.id) ?? []) {
        let raw: unknown;
        try {
          raw = portsValue.read(binding.source);
        } catch {
          return { ok: false, issue: issue("DATA_READ_FAILED", `$.bindings.${binding.prop}`, "trusted Studio data port failed") };
        }
        const parsed = parseJsonValue(raw, `$.bindings.${binding.prop}`);
        const definition = component.props.find((candidate) => candidate.key === binding.prop);
        if (!parsed.ok || !definition || !propAccepts(definition, parsed.value)) {
          return { ok: false, issue: issue("DATA_VALUE_INVALID", `$.bindings.${binding.prop}`, "resolved Studio binding value does not match the declared component prop type") };
        }
        props[binding.prop] = parsed.value;
      }
      nodes.push({
        id: node.id,
        component: node.component,
        order: node.order,
        props,
        ...(node.parentId === undefined ? {} : { parentId: node.parentId, slot: node.slot as string }),
      });
    }
    return { ok: true, value: freezeData({ experienceId: publicationValue.id, viewId: currentViewId, nodes }) };
  }

  const session: StudioRuntimeSession = {
    currentViewId() {
      return currentViewId;
    },
    currentView,
    currentRuntimeState() {
      return runtimeValue.currentState();
    },
    dispatch(eventInput): StudioRuntimeDispatchResult {
      if (disposed) return { ok: false, stage: "studio", issue: issue("SESSION_DISPOSED", "$", "Studio runtime session is disposed") };
      if (pending) return { ok: false, stage: "studio", issue: issue("ACTION_PENDING", "$.event", "one Studio action is already awaiting a host outcome") };
      const interaction = publicationValue.document.interactions.find((candidate) => candidate.viewId === currentViewId && candidate.nodeId === eventInput.nodeId && candidate.event === eventInput.event);
      if (!interaction) return { ok: false, stage: "studio", issue: issue("INTERACTION_NOT_FOUND", "$.event", "no published Studio interaction matches this node event") };
      const result = runtimeValue.process({ event: interaction.actionEvent, payload: eventInput.payload ?? {} });
      if (result.ok) pending = { actionId: result.value.action.id, routes: interaction.routes };
      return result;
    },
    applyHostPatch(patch) {
      return runtimeValue.processHostPatch(patch);
    },
    complete(completion): StudioRuntimeCompletionResult {
      if (disposed) return { ok: false, issue: issue("SESSION_DISPOSED", "$", "Studio runtime session is disposed") };
      if (!pending) return { ok: false, issue: issue("NO_PENDING_ACTION", "$.actionId", "no Studio action is awaiting a host outcome") };
      if (completion.actionId !== pending.actionId) return { ok: false, issue: issue("STALE_ACTION", "$.actionId", "host outcome does not match the pending Studio action") };
      if (!outcomes.has(completion.outcome)) return { ok: false, issue: issue("INVALID_OUTCOME", "$.outcome", "Studio outcome must be success, empty, or error") };
      const route = pending.routes.find((candidate) => candidate.outcome === completion.outcome);
      pending = undefined;
      if (!route) return { ok: true, value: Object.freeze({ viewId: currentViewId, transitioned: false }) };
      currentViewId = route.viewId;
      return { ok: true, value: Object.freeze({ viewId: currentViewId, transitioned: true }) };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      pending = undefined;
      runtimeValue.dispose();
    },
  };
  return { ok: true, value: Object.freeze(session) };
}
