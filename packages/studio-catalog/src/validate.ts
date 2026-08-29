import {
  isSemanticNamespace,
  isSemanticSegment,
  parseJsonValue,
} from "@vira-enterprise-genui/protocol";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import { parseStudioExperienceDocument } from "@vira-enterprise-genui/studio-schema";
import type { StudioNode } from "@vira-enterprise-genui/studio-schema";
import {
  STUDIO_CATALOG_LABEL_MAX_LENGTH,
  STUDIO_CATALOG_MAX_COMPONENTS,
  STUDIO_CATALOG_MAX_ENUM_OPTIONS,
  STUDIO_CATALOG_MAX_EVENTS_PER_COMPONENT,
  STUDIO_CATALOG_MAX_PROPS_PER_COMPONENT,
  STUDIO_CATALOG_MAX_SLOTS_PER_COMPONENT,
  STUDIO_COMPONENT_CATALOG_VERSION,
} from "./types.js";
import type {
  ResolveStudioCatalogComponentResult,
  StudioCatalogComponentDefinition,
  StudioCatalogComponentKind,
  StudioCatalogDocumentValidationCode,
  StudioCatalogDocumentValidationIssue,
  StudioCatalogDocumentValidationResult,
  StudioCatalogEventDefinition,
  StudioCatalogPropDefinition,
  StudioCatalogPropType,
  StudioCatalogSlotDefinition,
  StudioComponentCatalogResult,
  StudioComponentCatalogValidationCode,
  StudioComponentCatalogValidationIssue,
} from "./types.js";

const catalogFields = new Set(["version", "id", "brandId", "components"]);
const componentFields = new Set(["ref", "label", "category", "kind", "props", "slots", "events"]);
const propFields = new Set(["key", "type", "required", "bindable", "options"]);
const slotFields = new Set(["name", "label"]);
const eventFields = new Set(["name", "label"]);
const componentKinds = new Set<StudioCatalogComponentKind>(["layout", "content", "input", "action", "feedback"]);
const propTypes = new Set<StudioCatalogPropType>(["string", "number", "boolean", "enum"]);
const controlCharacterPattern = /[\u0000-\u001F\u007F]/;

type CatalogFailure = { readonly ok: false; readonly issue: StudioComponentCatalogValidationIssue };
type CatalogListResult<T> = { readonly ok: true; readonly value: readonly T[] } | CatalogFailure;
type DocumentFailure = { readonly ok: false; readonly issue: StudioCatalogDocumentValidationIssue };

function freezeCatalogData<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) freezeCatalogData(item);
    return Object.freeze(value);
  }
  const object = value as Record<string, unknown>;
  for (const key of Object.keys(object)) freezeCatalogData(object[key]);
  return Object.freeze(value);
}

function failure(
  code: StudioComponentCatalogValidationCode,
  path: string,
  message: string,
): CatalogFailure {
  return { ok: false, issue: { code, path, message } };
}

function documentFailure(
  code: StudioCatalogDocumentValidationCode,
  path: string,
  message: string,
): DocumentFailure {
  return { ok: false, issue: { code, path, message } };
}

function resolveFailure(
  code: StudioCatalogDocumentValidationCode,
  path: string,
  message: string,
): ResolveStudioCatalogComponentResult {
  return { ok: false, issue: { code, path, message } };
}

function nestedPath(base: string, path: string): string {
  return path === "$" ? base : `${base}${path.slice(1)}`;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validLabel(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= STUDIO_CATALOG_LABEL_MAX_LENGTH
    && value.trim() === value
    && !controlCharacterPattern.test(value);
}

function validComponentReference(value: unknown): value is string {
  return typeof value === "string" && value.includes(".") && isSemanticNamespace(value);
}

function ownDataValue(object: object, field: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(object, field);
  if (!descriptor || !("value" in descriptor)) return undefined;
  return descriptor.value;
}

function preflightCatalog(input: unknown): CatalogFailure | undefined {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return undefined;
  const components = ownDataValue(input, "components");
  if (!Array.isArray(components)) return undefined;
  if (components.length > STUDIO_CATALOG_MAX_COMPONENTS) {
    return failure("COMPONENT_LIMIT_EXCEEDED", "$.components", "component catalog limit exceeded");
  }

  for (let componentIndex = 0; componentIndex < components.length; componentIndex += 1) {
    const componentDescriptor = Object.getOwnPropertyDescriptor(components, String(componentIndex));
    if (!componentDescriptor || !("value" in componentDescriptor)) continue;
    const component = componentDescriptor.value;
    if (component === null || typeof component !== "object" || Array.isArray(component)) continue;

    for (const [field, limit, code] of [
      ["props", STUDIO_CATALOG_MAX_PROPS_PER_COMPONENT, "PROP_LIMIT_EXCEEDED"],
      ["slots", STUDIO_CATALOG_MAX_SLOTS_PER_COMPONENT, "SLOT_LIMIT_EXCEEDED"],
      ["events", STUDIO_CATALOG_MAX_EVENTS_PER_COMPONENT, "EVENT_LIMIT_EXCEEDED"],
    ] as const) {
      const value = ownDataValue(component, field);
      if (Array.isArray(value) && value.length > limit) {
        return failure(code, `$.components[${componentIndex}].${field}`, `component ${field} limit exceeded`);
      }
    }

    const props = ownDataValue(component, "props");
    if (!Array.isArray(props)) continue;
    for (let propIndex = 0; propIndex < Math.min(props.length, STUDIO_CATALOG_MAX_PROPS_PER_COMPONENT); propIndex += 1) {
      const propDescriptor = Object.getOwnPropertyDescriptor(props, String(propIndex));
      if (!propDescriptor || !("value" in propDescriptor)) continue;
      const prop = propDescriptor.value;
      if (prop === null || typeof prop !== "object" || Array.isArray(prop)) continue;
      const options = ownDataValue(prop, "options");
      if (Array.isArray(options) && options.length > STUDIO_CATALOG_MAX_ENUM_OPTIONS) {
        return failure(
          "INVALID_ENUM_OPTIONS",
          `$.components[${componentIndex}].props[${propIndex}].options`,
          "enum option limit exceeded",
        );
      }
    }
  }
  return undefined;
}

function parseProps(value: JsonValue, path: string): CatalogListResult<StudioCatalogPropDefinition> {
  if (!Array.isArray(value)) return failure("INVALID_PROPS", path, "props must be an array");
  if (value.length > STUDIO_CATALOG_MAX_PROPS_PER_COMPONENT) return failure("PROP_LIMIT_EXCEEDED", path, "component prop limit exceeded");

  const output: StudioCatalogPropDefinition[] = [];
  const keys = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    const itemPath = `${path}[${index}]`;
    if (!isJsonObject(item)) return failure("INVALID_PROP", itemPath, "prop definition must be an object");
    const unknownField = Object.keys(item).sort().find((field) => !propFields.has(field));
    if (unknownField) return failure("INVALID_PROP", `${itemPath}.${unknownField}`, `unknown prop field: ${unknownField}`);
    if (typeof item.key !== "string" || !isSemanticSegment(item.key)) return failure("INVALID_PROP", `${itemPath}.key`, "prop key must be one semantic segment");
    if (keys.has(item.key)) return failure("DUPLICATE_PROP", `${itemPath}.key`, "duplicate component prop key");
    if (typeof item.type !== "string" || !propTypes.has(item.type as StudioCatalogPropType)) return failure("INVALID_PROP", `${itemPath}.type`, "unsupported prop type");
    if (typeof item.required !== "boolean") return failure("INVALID_PROP", `${itemPath}.required`, "required must be boolean");
    if (typeof item.bindable !== "boolean") return failure("INVALID_PROP", `${itemPath}.bindable`, "bindable must be boolean");

    const type = item.type as StudioCatalogPropType;
    let options: readonly string[] | undefined;
    if (type === "enum") {
      if (!Array.isArray(item.options) || item.options.length === 0 || item.options.length > STUDIO_CATALOG_MAX_ENUM_OPTIONS) {
        return failure("INVALID_ENUM_OPTIONS", `${itemPath}.options`, "enum props require a bounded non-empty options array");
      }
      const seenOptions = new Set<string>();
      const normalizedOptions: string[] = [];
      for (let optionIndex = 0; optionIndex < item.options.length; optionIndex += 1) {
        const option = item.options[optionIndex];
        if (!validLabel(option)) return failure("INVALID_ENUM_OPTIONS", `${itemPath}.options[${optionIndex}]`, "enum option must be a bounded display string");
        if (seenOptions.has(option)) return failure("INVALID_ENUM_OPTIONS", `${itemPath}.options[${optionIndex}]`, "duplicate enum option");
        seenOptions.add(option);
        normalizedOptions.push(option);
      }
      options = normalizedOptions;
    } else if (Object.hasOwn(item, "options")) {
      return failure("INVALID_ENUM_OPTIONS", `${itemPath}.options`, "options are valid only for enum props");
    }

    keys.add(item.key);
    output.push({
      key: item.key,
      type,
      required: item.required,
      bindable: item.bindable,
      ...(options === undefined ? {} : { options }),
    });
  }
  return { ok: true, value: output };
}

function parseSlots(value: JsonValue, path: string): CatalogListResult<StudioCatalogSlotDefinition> {
  if (!Array.isArray(value)) return failure("INVALID_SLOTS", path, "slots must be an array");
  if (value.length > STUDIO_CATALOG_MAX_SLOTS_PER_COMPONENT) return failure("SLOT_LIMIT_EXCEEDED", path, "component slot limit exceeded");
  const output: StudioCatalogSlotDefinition[] = [];
  const names = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    const itemPath = `${path}[${index}]`;
    if (!isJsonObject(item)) return failure("INVALID_SLOT", itemPath, "slot definition must be an object");
    const unknownField = Object.keys(item).sort().find((field) => !slotFields.has(field));
    if (unknownField) return failure("INVALID_SLOT", `${itemPath}.${unknownField}`, `unknown slot field: ${unknownField}`);
    if (typeof item.name !== "string" || !isSemanticSegment(item.name)) return failure("INVALID_SLOT", `${itemPath}.name`, "slot name must be one semantic segment");
    if (names.has(item.name)) return failure("DUPLICATE_SLOT", `${itemPath}.name`, "duplicate component slot");
    if (!validLabel(item.label)) return failure("INVALID_LABEL", `${itemPath}.label`, "slot label must be a bounded display string");
    names.add(item.name);
    output.push({ name: item.name, label: item.label });
  }
  return { ok: true, value: output };
}

function parseEvents(value: JsonValue, path: string): CatalogListResult<StudioCatalogEventDefinition> {
  if (!Array.isArray(value)) return failure("INVALID_EVENTS", path, "events must be an array");
  if (value.length > STUDIO_CATALOG_MAX_EVENTS_PER_COMPONENT) return failure("EVENT_LIMIT_EXCEEDED", path, "component event limit exceeded");
  const output: StudioCatalogEventDefinition[] = [];
  const names = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    const itemPath = `${path}[${index}]`;
    if (!isJsonObject(item)) return failure("INVALID_EVENT", itemPath, "event definition must be an object");
    const unknownField = Object.keys(item).sort().find((field) => !eventFields.has(field));
    if (unknownField) return failure("INVALID_EVENT", `${itemPath}.${unknownField}`, `unknown event field: ${unknownField}`);
    if (typeof item.name !== "string" || !isSemanticSegment(item.name)) return failure("INVALID_EVENT", `${itemPath}.name`, "event name must be one semantic segment");
    if (names.has(item.name)) return failure("DUPLICATE_EVENT", `${itemPath}.name`, "duplicate component event");
    if (!validLabel(item.label)) return failure("INVALID_LABEL", `${itemPath}.label`, "event label must be a bounded display string");
    names.add(item.name);
    output.push({ name: item.name, label: item.label });
  }
  return { ok: true, value: output };
}

export function createStudioComponentCatalog(input: unknown): StudioComponentCatalogResult {
  const preflight = preflightCatalog(input);
  if (preflight) return preflight;

  const parsed = parseJsonValue(input);
  if (!parsed.ok) return failure("INVALID_TYPE", parsed.issue.path, parsed.issue.reason);
  if (!isJsonObject(parsed.value)) return failure("INVALID_TYPE", "$", "studio component catalog must be an object");
  const fields = parsed.value;

  const unknownField = Object.keys(fields).sort().find((field) => !catalogFields.has(field));
  if (unknownField) return failure("UNKNOWN_FIELD", `$.${unknownField}`, `unknown studio catalog field: ${unknownField}`);
  if (fields.version !== STUDIO_COMPONENT_CATALOG_VERSION) return failure("INVALID_VERSION", "$.version", `studio component catalog version must be ${STUDIO_COMPONENT_CATALOG_VERSION}`);
  if (typeof fields.id !== "string" || !isSemanticNamespace(fields.id)) return failure("INVALID_ID", "$.id", "catalog id must be a semantic namespace");
  if (typeof fields.brandId !== "string" || !isSemanticNamespace(fields.brandId)) return failure("INVALID_BRAND_ID", "$.brandId", "brandId must be a semantic namespace");
  if (!Array.isArray(fields.components) || fields.components.length === 0) return failure("INVALID_COMPONENTS", "$.components", "components must be a non-empty array");
  if (fields.components.length > STUDIO_CATALOG_MAX_COMPONENTS) return failure("COMPONENT_LIMIT_EXCEEDED", "$.components", "component catalog limit exceeded");

  const components: StudioCatalogComponentDefinition[] = [];
  const refs = new Set<string>();
  for (let index = 0; index < fields.components.length; index += 1) {
    const item = fields.components[index];
    const itemPath = `$.components[${index}]`;
    if (!isJsonObject(item)) return failure("INVALID_COMPONENT", itemPath, "component definition must be an object");
    const unknownComponentField = Object.keys(item).sort().find((field) => !componentFields.has(field));
    if (unknownComponentField) return failure("INVALID_COMPONENT", `${itemPath}.${unknownComponentField}`, `unknown component field: ${unknownComponentField}`);
    if (!validComponentReference(item.ref)) return failure("INVALID_COMPONENT_REFERENCE", `${itemPath}.ref`, "component ref must be a namespaced semantic reference");
    if (refs.has(item.ref)) return failure("DUPLICATE_COMPONENT", `${itemPath}.ref`, "duplicate component reference");
    if (!validLabel(item.label)) return failure("INVALID_LABEL", `${itemPath}.label`, "component label must be a bounded display string");
    if (typeof item.category !== "string" || !isSemanticNamespace(item.category)) return failure("INVALID_CATEGORY", `${itemPath}.category`, "component category must be a semantic namespace");
    if (typeof item.kind !== "string" || !componentKinds.has(item.kind as StudioCatalogComponentKind)) return failure("INVALID_KIND", `${itemPath}.kind`, "unsupported component kind");

    const props = parseProps(item.props, `${itemPath}.props`);
    if (!props.ok) return props;
    const slots = parseSlots(item.slots, `${itemPath}.slots`);
    if (!slots.ok) return slots;
    const events = parseEvents(item.events, `${itemPath}.events`);
    if (!events.ok) return events;

    refs.add(item.ref);
    components.push({
      ref: item.ref,
      label: item.label,
      category: item.category,
      kind: item.kind as StudioCatalogComponentKind,
      props: props.value,
      slots: slots.value,
      events: events.value,
    });
  }

  return {
    ok: true,
    value: freezeCatalogData({
      version: STUDIO_COMPONENT_CATALOG_VERSION,
      id: fields.id,
      brandId: fields.brandId,
      components,
    }),
  };
}

export function resolveStudioCatalogComponent(catalogInput: unknown, componentRef: string): ResolveStudioCatalogComponentResult {
  const catalog = createStudioComponentCatalog(catalogInput);
  if (!catalog.ok) return resolveFailure("INVALID_CATALOG", nestedPath("$.catalog", catalog.issue.path), catalog.issue.message);
  const component = catalog.value.components.find((candidate) => candidate.ref === componentRef);
  if (!component) return resolveFailure("UNREGISTERED_COMPONENT", "$.component", "component is not registered in the studio catalog");
  return { ok: true, value: component };
}

function propAccepts(definition: StudioCatalogPropDefinition, value: JsonValue): boolean {
  switch (definition.type) {
    case "string": return typeof value === "string";
    case "number": return typeof value === "number";
    case "boolean": return typeof value === "boolean";
    case "enum": return typeof value === "string" && (definition.options?.includes(value) ?? false);
  }
}

function nodeKey(viewId: string, nodeId: string): string {
  return `${viewId}\u0000${nodeId}`;
}

function propTargetKey(viewId: string, nodeId: string, prop: string): string {
  return `${viewId}\u0000${nodeId}\u0000${prop}`;
}

export function validateStudioDocumentAgainstCatalog(
  documentInput: unknown,
  catalogInput: unknown,
): StudioCatalogDocumentValidationResult {
  const catalog = createStudioComponentCatalog(catalogInput);
  if (!catalog.ok) return documentFailure("INVALID_CATALOG", nestedPath("$.catalog", catalog.issue.path), catalog.issue.message);
  const document = parseStudioExperienceDocument(documentInput);
  if (!document.ok) return documentFailure("INVALID_DOCUMENT", nestedPath("$.document", document.issue.path), document.issue.message);

  const components = new Map(catalog.value.components.map((component) => [component.ref, component] as const));
  const nodes = new Map<string, { readonly viewIndex: number; readonly nodeIndex: number; readonly node: StudioNode; readonly component: StudioCatalogComponentDefinition }>();

  for (let viewIndex = 0; viewIndex < document.value.views.length; viewIndex += 1) {
    const view = document.value.views[viewIndex];
    if (!view) continue;
    for (let nodeIndex = 0; nodeIndex < view.nodes.length; nodeIndex += 1) {
      const node = view.nodes[nodeIndex];
      if (!node) continue;
      const component = components.get(node.component);
      if (!component) return documentFailure("UNREGISTERED_COMPONENT", `$.document.views[${viewIndex}].nodes[${nodeIndex}].component`, "component is not registered in the active brand catalog");
      nodes.set(nodeKey(view.id, node.id), { viewIndex, nodeIndex, node, component });
    }
  }

  const boundTargets = new Set<string>();
  for (let bindingIndex = 0; bindingIndex < document.value.bindings.length; bindingIndex += 1) {
    const binding = document.value.bindings[bindingIndex];
    if (!binding) continue;
    const entry = nodes.get(nodeKey(binding.viewId, binding.nodeId));
    if (!entry) continue;
    const prop = entry.component.props.find((candidate) => candidate.key === binding.prop);
    if (!prop) return documentFailure("UNKNOWN_BINDING_PROP", `$.document.bindings[${bindingIndex}].prop`, "binding targets a prop not declared by the component catalog");
    if (!prop.bindable) return documentFailure("UNBINDABLE_PROP", `$.document.bindings[${bindingIndex}].prop`, "component prop is not bindable");
    if (Object.hasOwn(entry.node.props, binding.prop)) return documentFailure("PROP_SOURCE_CONFLICT", `$.document.bindings[${bindingIndex}].prop`, "prop cannot have both a static value and a data binding");
    boundTargets.add(propTargetKey(binding.viewId, binding.nodeId, binding.prop));
  }

  for (const entry of nodes.values()) {
    const { viewIndex, nodeIndex, node, component } = entry;
    const viewId = document.value.views[viewIndex]?.id;
    if (!viewId) continue;
    const propDefinitions = new Map(component.props.map((prop) => [prop.key, prop] as const));
    for (const [propKey, propValue] of Object.entries(node.props)) {
      const definition = propDefinitions.get(propKey);
      if (!definition) return documentFailure("UNKNOWN_PROP", `$.document.views[${viewIndex}].nodes[${nodeIndex}].props.${propKey}`, "prop is not declared by the component catalog");
      if (!propAccepts(definition, propValue)) return documentFailure("INVALID_PROP_VALUE", `$.document.views[${viewIndex}].nodes[${nodeIndex}].props.${propKey}`, "static prop value does not match the catalog descriptor");
    }

    for (const definition of component.props) {
      if (!definition.required) continue;
      const hasStatic = Object.hasOwn(node.props, definition.key);
      const hasBinding = boundTargets.has(propTargetKey(viewId, node.id, definition.key));
      if (!hasStatic && !hasBinding) return documentFailure("MISSING_REQUIRED_PROP", `$.document.views[${viewIndex}].nodes[${nodeIndex}].props.${definition.key}`, "required component prop has no static value or binding");
    }

    if (node.parentId !== undefined) {
      const parent = nodes.get(nodeKey(viewId, node.parentId));
      if (!parent) continue;
      const allowed = parent.component.slots.some((slot) => slot.name === node.slot);
      if (!allowed) return documentFailure("INVALID_SLOT_TARGET", `$.document.views[${viewIndex}].nodes[${nodeIndex}].slot`, "parent component does not declare this slot");
    }
  }

  for (let interactionIndex = 0; interactionIndex < document.value.interactions.length; interactionIndex += 1) {
    const interaction = document.value.interactions[interactionIndex];
    if (!interaction) continue;
    const entry = nodes.get(nodeKey(interaction.viewId, interaction.nodeId));
    if (!entry) continue;
    if (!entry.component.events.some((event) => event.name === interaction.event)) {
      return documentFailure("UNDECLARED_EVENT", `$.document.interactions[${interactionIndex}].event`, "component does not declare this interaction event");
    }
  }

  return { ok: true, value: document.value };
}
