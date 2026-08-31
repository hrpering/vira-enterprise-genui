import { parseJsonValue } from "@vira-enterprise-genui/protocol";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import { createStateBindingSession } from "@vira-enterprise-genui/runtime-web";
import type { RuntimeWebActionIdFactory } from "@vira-enterprise-genui/runtime-web";
import { createStudioComponentCatalog } from "@vira-enterprise-genui/studio-catalog";
import type { StudioCatalogPropDefinition } from "@vira-enterprise-genui/studio-catalog";
import type { StudioPublication } from "@vira-enterprise-genui/studio-compiler";
import { prepareStudioPublication } from "@vira-enterprise-genui/studio-publish";
import type {
  StudioBindingSource,
  StudioInteraction,
  StudioInteractionPayloadSource,
  StudioInteractionRoute,
  StudioNode,
} from "@vira-enterprise-genui/studio-schema";
import { STUDIO_RUNTIME_MAX_REPEAT_ITEMS } from "./types.js";
import type {
  CreateStudioRuntimeSessionResult,
  StudioRuntimeCompletionResult,
  StudioRuntimeDataPort,
  StudioRuntimeDispatchResult,
  StudioRuntimeIssue,
  StudioRuntimeNodeModel,
  StudioRuntimePorts,
  StudioRuntimeSession,
  StudioRuntimeValidationCode,
  StudioRuntimeViewResult,
} from "./types.js";

const inputFields = new Set([
  "publication",
  "componentCatalog",
  "bindingSourceCatalog",
  "actionAdapter",
  "runtimeState",
  "permissionPolicy",
]);
const outcomes = new Set(["success", "empty", "error"]);
const ORDER_STRIDE = STUDIO_RUNTIME_MAX_REPEAT_ITEMS + 1;

function issue(
  code: StudioRuntimeValidationCode,
  path: string,
  message: string,
): StudioRuntimeIssue {
  return Object.freeze({ code, path, message });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function readDataObject(value: unknown):
  | { readonly ok: true; readonly value: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly issue: StudioRuntimeIssue } {
  if (!isPlainObject(value) || Object.getOwnPropertySymbols(value).length > 0) {
    return {
      ok: false,
      issue: issue("INVALID_INPUT", "$", "Studio runtime input must be a plain data object"),
    };
  }
  const keys = Object.keys(value);
  if (Object.getOwnPropertyNames(value).length !== keys.length) {
    return {
      ok: false,
      issue: issue("INVALID_INPUT", "$", "Studio runtime input must not contain non-enumerable fields"),
    };
  }
  const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) {
      return {
        ok: false,
        issue: issue("INVALID_INPUT", `$.${key}`, "Studio runtime input must not contain accessor fields"),
      };
    }
    output[key] = descriptor.value;
  }
  return { ok: true, value: output };
}

function readFunction(
  object: unknown,
  field: string,
): ((...args: readonly unknown[]) => unknown) | undefined {
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
    for (let index = 0; index < left.length; index += 1) {
      if (!sameData(left[index], right[index])) return false;
    }
    return true;
  }
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const ak = Object.keys(a).sort();
  const bk = Object.keys(b).sort();
  if (ak.length !== bk.length) return false;
  for (let index = 0; index < ak.length; index += 1) {
    const key = ak[index];
    if (!key || key !== bk[index] || !sameData(a[key], b[key])) return false;
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
  if (definition.type === "string") return typeof value === "string";
  if (definition.type === "number") return typeof value === "number";
  if (definition.type === "boolean") return typeof value === "boolean";
  return typeof value === "string" && (definition.options?.includes(value) ?? false);
}

function validatePorts(ports: StudioRuntimePorts):
  | {
      readonly ok: true;
      readonly read: StudioRuntimeDataPort["read"];
      readonly idFactory: RuntimeWebActionIdFactory;
    }
  | { readonly ok: false; readonly issue: StudioRuntimeIssue } {
  if (!isPlainObject(ports)) {
    return { ok: false, issue: issue("INVALID_PORTS", "$.ports", "Studio runtime ports must be a plain object") };
  }
  const dataDescriptor = Object.getOwnPropertyDescriptor(ports, "data");
  const actionDescriptor = Object.getOwnPropertyDescriptor(ports, "actionIds");
  if (!dataDescriptor || !("value" in dataDescriptor) || !actionDescriptor || !("value" in actionDescriptor)) {
    return { ok: false, issue: issue("INVALID_PORTS", "$.ports", "Studio runtime ports require data and actionIds") };
  }
  const read = readFunction(dataDescriptor.value, "read");
  const nextId = readFunction(actionDescriptor.value, "nextId");
  if (!read || !nextId) {
    return { ok: false, issue: issue("INVALID_PORTS", "$.ports", "Studio runtime ports require data.read and actionIds.nextId") };
  }
  return {
    ok: true,
    read: (source) => read(source),
    idFactory: Object.freeze({ nextId: () => nextId() as string }),
  };
}

function canonicalPublication(fields: Readonly<Record<string, unknown>>):
  | { readonly ok: true; readonly value: StudioPublication }
  | { readonly ok: false; readonly issue: StudioRuntimeIssue } {
  const parsed = parseJsonValue(fields.publication, "$.publication");
  if (!parsed.ok || parsed.value === null || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    return {
      ok: false,
      issue: issue(
        "INVALID_PUBLICATION",
        parsed.ok ? "$.publication" : parsed.issue.path,
        "Studio publication must be canonical JSON data",
      ),
    };
  }
  const publicationObject = parsed.value as JsonObject;
  const rebuilt = prepareStudioPublication({
    document: publicationObject.document,
    componentCatalog: fields.componentCatalog,
    bindingSourceCatalog: fields.bindingSourceCatalog,
    actionAdapter: fields.actionAdapter,
  });
  if (!rebuilt.ok) {
    return { ok: false, issue: issue("INVALID_PUBLICATION", rebuilt.issue.path, rebuilt.issue.message) };
  }
  if (!sameData(publicationObject, rebuilt.value)) {
    return {
      ok: false,
      issue: issue("FORGED_PUBLICATION", "$.publication", "Studio publication does not match canonical compilation"),
    };
  }
  return { ok: true, value: rebuilt.value };
}

function scopeValue(item: JsonValue | undefined, path: string): JsonValue | undefined {
  if (item === undefined || !path.startsWith("currentItem.")) return undefined;
  let current: JsonValue | undefined = item;
  for (const segment of path.slice("currentItem.".length).split(".")) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) return undefined;
    const record = current as JsonObject;
    current = record[segment];
  }
  return current;
}

function runtimeId(sourceId: string, suffix: string): string {
  return suffix.length === 0 ? sourceId : `${sourceId}~${suffix}`;
}

export function createStudioRuntimeSession(
  input: unknown,
  portsInput: StudioRuntimePorts,
): CreateStudioRuntimeSessionResult {
  const root = readDataObject(input);
  if (!root.ok) return root;
  const fields = root.value;
  const unknown = Object.keys(fields).sort().find((field) => !inputFields.has(field));
  if (unknown) {
    return { ok: false, issue: issue("INVALID_INPUT", `$.${unknown}`, "unknown Studio runtime session field") };
  }

  const validatedPorts = validatePorts(portsInput);
  if (!validatedPorts.ok) return validatedPorts;
  const dataRead = validatedPorts.read;
  const idFactory = validatedPorts.idFactory;

  const publication = canonicalPublication(fields);
  if (!publication.ok) return publication;
  const publicationValue = publication.value;

  const catalog = createStudioComponentCatalog(fields.componentCatalog);
  if (!catalog.ok) {
    return { ok: false, issue: issue("INVALID_PUBLICATION", "$.componentCatalog", catalog.issue.message) };
  }

  const runtime = createStateBindingSession(
    {
      state: fields.runtimeState,
      policy: fields.permissionPolicy,
      actionAdapter: fields.actionAdapter,
    },
    idFactory,
  );
  if (!runtime.ok) {
    return { ok: false, issue: issue("INVALID_RUNTIME_SESSION", runtime.issue.path, runtime.issue.message) };
  }
  const runtimeValue = runtime.value;
  const components = new Map(catalog.value.components.map((component) => [component.ref, component] as const));
  let currentViewId = publicationValue.entryView;
  let pending: { readonly actionId: string; readonly routes: readonly StudioInteractionRoute[] } | undefined;
  let disposed = false;

  function readSource(
    source: StudioBindingSource | StudioInteractionPayloadSource,
    scope: JsonValue | undefined,
    path: string,
  ):
    | { readonly ok: true; readonly value: JsonValue }
    | { readonly ok: false; readonly issue: StudioRuntimeIssue } {
    if (source.kind === "literal") return { ok: true, value: source.value };
    if (source.kind === "scope") {
      const value = scopeValue(scope, source.path);
      return value === undefined
        ? { ok: false, issue: issue("DATA_VALUE_INVALID", path, "scope value is unavailable") }
        : { ok: true, value };
    }

    let raw: unknown;
    try {
      raw = dataRead(source);
    } catch {
      return { ok: false, issue: issue("DATA_READ_FAILED", path, "trusted Studio data port failed") };
    }
    const parsed = parseJsonValue(raw, path);
    return parsed.ok
      ? { ok: true, value: parsed.value }
      : { ok: false, issue: issue("DATA_VALUE_INVALID", path, "Studio data is not canonical JSON") };
  }

  function currentView(): StudioRuntimeViewResult {
    if (disposed) {
      return { ok: false, issue: issue("SESSION_DISPOSED", "$", "Studio runtime session is disposed") };
    }
    const view = publicationValue.document.views.find((candidate) => candidate.id === currentViewId);
    if (!view) {
      return { ok: false, issue: issue("VIEW_NOT_FOUND", "$.viewId", "current Studio view does not exist") };
    }

    const byParent = new Map<string, StudioNode[]>();
    for (const node of view.nodes) {
      const key = node.parentId ?? "$root";
      const list = byParent.get(key) ?? [];
      list.push(node);
      byParent.set(key, list);
    }
    for (const list of byParent.values()) list.sort((a, b) => a.order - b.order);

    const bindings = new Map<string, typeof publicationValue.document.bindings>();
    for (const binding of publicationValue.document.bindings) {
      if (binding.viewId === currentViewId) {
        bindings.set(binding.nodeId, [...(bindings.get(binding.nodeId) ?? []), binding]);
      }
    }

    const interactions = new Map<string, StudioInteraction[]>();
    for (const interaction of publicationValue.document.interactions) {
      if (interaction.viewId === currentViewId) {
        interactions.set(interaction.nodeId, [...(interactions.get(interaction.nodeId) ?? []), interaction]);
      }
    }

    const nodes: StudioRuntimeNodeModel[] = [];

    function build(
      node: StudioNode,
      parentId: string | undefined,
      scope: JsonValue | undefined,
      suffix: string,
      order: number,
    ): StudioRuntimeIssue | undefined {
      const component = components.get(node.component);
      if (!component) {
        return issue("INVALID_PUBLICATION", "$.publication.document", "published component metadata is unavailable");
      }
      const id = runtimeId(node.id, suffix);
      const props: Record<string, JsonValue> = { ...node.props };

      for (const binding of bindings.get(node.id) ?? []) {
        const value = readSource(binding.source, scope, `$.bindings.${binding.prop}`);
        if (!value.ok) return value.issue;
        const definition = component.props.find((candidate) => candidate.key === binding.prop);
        if (!definition || !propAccepts(definition, value.value)) {
          return issue(
            "DATA_VALUE_INVALID",
            `$.bindings.${binding.prop}`,
            "resolved binding does not match component prop type",
          );
        }
        props[binding.prop] = value.value;
      }

      const eventPayloads: Record<string, JsonObject> = Object.create(null) as Record<string, JsonObject>;
      for (const interaction of interactions.get(node.id) ?? []) {
        const payload: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
        for (const mapping of interaction.payloadBindings ?? []) {
          const value = readSource(
            mapping.source,
            scope,
            `$.interactions.${interaction.event}.${mapping.key}`,
          );
          if (!value.ok) return value.issue;
          payload[mapping.key] = value.value;
        }
        eventPayloads[interaction.event] = payload;
      }

      nodes.push({
        id,
        sourceNodeId: node.id,
        component: node.component,
        order,
        props,
        eventPayloads,
        ...(parentId === undefined ? {} : { parentId, slot: node.slot as string }),
      });

      for (const child of byParent.get(node.id) ?? []) {
        const childIssue = expand(child, id, scope, suffix);
        if (childIssue) return childIssue;
      }
      return undefined;
    }

    function expand(
      node: StudioNode,
      parentId: string | undefined,
      scope: JsonValue | undefined,
      parentSuffix: string,
    ): StudioRuntimeIssue | undefined {
      if (!node.repeat) {
        return build(node, parentId, scope, parentSuffix, node.order * ORDER_STRIDE);
      }
      const collection = readSource(node.repeat.source, scope, `$.repeat.${node.id}`);
      if (!collection.ok) return collection.issue;
      if (!Array.isArray(collection.value)) {
        return issue("DATA_VALUE_INVALID", `$.repeat.${node.id}`, "repeat source must resolve to an array");
      }
      if (collection.value.length > STUDIO_RUNTIME_MAX_REPEAT_ITEMS) {
        return issue(
          "REPEAT_LIMIT_EXCEEDED",
          `$.repeat.${node.id}`,
          `repeat item limit is ${STUDIO_RUNTIME_MAX_REPEAT_ITEMS}`,
        );
      }
      for (let index = 0; index < collection.value.length; index += 1) {
        const suffix = `${parentSuffix}${parentSuffix ? "." : ""}${node.id}-${index}`;
        const item = collection.value[index];
        const childIssue = build(node, parentId, item, suffix, node.order * ORDER_STRIDE + index);
        if (childIssue) return childIssue;
      }
      return undefined;
    }

    for (const node of byParent.get("$root") ?? []) {
      const nodeIssue = expand(node, undefined, undefined, "");
      if (nodeIssue) return { ok: false, issue: nodeIssue };
    }

    return {
      ok: true,
      value: freezeData({
        experienceId: publicationValue.id,
        viewId: currentViewId,
        nodes,
      }),
    };
  }

  const session: StudioRuntimeSession = {
    currentViewId: () => currentViewId,
    currentView,
    currentRuntimeState: () => runtimeValue.currentState(),
    dispatch(eventInput): StudioRuntimeDispatchResult {
      if (disposed) {
        return {
          ok: false,
          stage: "studio",
          issue: issue("SESSION_DISPOSED", "$", "Studio runtime session is disposed"),
        };
      }
      if (pending) {
        return {
          ok: false,
          stage: "studio",
          issue: issue("ACTION_PENDING", "$.event", "one Studio action is already awaiting a host outcome"),
        };
      }
      const interaction = publicationValue.document.interactions.find(
        (candidate) => candidate.viewId === currentViewId
          && candidate.nodeId === eventInput.nodeId
          && candidate.event === eventInput.event,
      );
      if (!interaction) {
        return {
          ok: false,
          stage: "studio",
          issue: issue("INTERACTION_NOT_FOUND", "$.event", "no published Studio interaction matches this node event"),
        };
      }
      const result = runtimeValue.process({
        event: interaction.actionEvent,
        payload: eventInput.payload ?? {},
      });
      if (result.ok) {
        pending = { actionId: result.value.action.id, routes: interaction.routes };
      }
      return result;
    },
    applyHostPatch: (patch) => runtimeValue.processHostPatch(patch),
    complete(completion): StudioRuntimeCompletionResult {
      if (disposed) {
        return { ok: false, issue: issue("SESSION_DISPOSED", "$", "Studio runtime session is disposed") };
      }
      if (!pending) {
        return { ok: false, issue: issue("NO_PENDING_ACTION", "$.actionId", "no Studio action is awaiting host outcome") };
      }
      if (completion.actionId !== pending.actionId) {
        return { ok: false, issue: issue("STALE_ACTION", "$.actionId", "host outcome does not match pending action") };
      }
      if (!outcomes.has(completion.outcome)) {
        return { ok: false, issue: issue("INVALID_OUTCOME", "$.outcome", "Studio outcome must be success, empty, or error") };
      }
      const route = pending.routes.find((candidate) => candidate.outcome === completion.outcome);
      pending = undefined;
      if (!route) {
        return {
          ok: true,
          value: Object.freeze({ viewId: currentViewId, transitioned: false }),
        };
      }
      currentViewId = route.viewId;
      return {
        ok: true,
        value: Object.freeze({ viewId: currentViewId, transitioned: true }),
      };
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
