import type { Data } from "@puckeditor/core";
import { isSemanticSegment, parseJsonValue } from "@vira-enterprise-genui/protocol";
import type { JsonArray, JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import {
  createStudioComponentCatalog,
  validateStudioDocumentAgainstCatalog,
} from "@vira-enterprise-genui/studio-catalog";
import type {
  StudioCatalogComponentDefinition,
  StudioComponentCatalog,
} from "@vira-enterprise-genui/studio-catalog";
import {
  parseStudioExperienceDocument,
  STUDIO_MAX_NODES_PER_VIEW,
} from "@vira-enterprise-genui/studio-schema";
import type {
  StudioExperienceDocument,
  StudioNode,
  StudioView,
} from "@vira-enterprise-genui/studio-schema";
import { findPuckCatalogCompatibilityIssue } from "./compat.js";
import { STUDIO_PUCK_ID_MAX_LENGTH } from "./types.js";
import type {
  StudioPuckAdapterValidationCode,
  StudioPuckAdapterValidationIssue,
  StudioPuckDataExportResult,
  StudioPuckDataImportResult,
} from "./types.js";

const puckDataFields = new Set(["content", "root", "zones"]);
const componentDataFields = new Set(["type", "props", "readOnly"]);
const rootDataFields = new Set(["props", "readOnly"]);
const mappingFields = new Set(["puckId", "nodeId"]);
const controlCharacterPattern = /[\u0000-\u001F\u007F]/;

function exportFailure(code: StudioPuckAdapterValidationCode, path: string, message: string): StudioPuckDataExportResult {
  return { ok: false, issue: { code, path, message } };
}

function importFailure(code: StudioPuckAdapterValidationCode, path: string, message: string): StudioPuckDataImportResult {
  return { ok: false, issue: { code, path, message } };
}

function adapterIssue(code: StudioPuckAdapterValidationCode, path: string, message: string): StudioPuckAdapterValidationIssue {
  return { code, path, message };
}

function nestedPath(base: string, path: string): string {
  return path === "$" ? base : `${base}${path.slice(1)}`;
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function ownDataValue(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function validPuckId(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= STUDIO_PUCK_ID_MAX_LENGTH
    && value.trim() === value
    && !controlCharacterPattern.test(value);
}

function componentMap(catalog: StudioComponentCatalog): ReadonlyMap<string, StudioCatalogComponentDefinition> {
  return new Map(catalog.components.map((component) => [component.ref, component] as const));
}

function scopeKey(parentId?: string, slot?: string): string {
  return parentId === undefined ? "$root" : `${parentId}\u0000${slot ?? ""}`;
}

function bindingKey(viewId: string, nodeId: string): string {
  return `${viewId}\u0000${nodeId}`;
}

function parsePuckCatalog(input: unknown):
  | { readonly ok: true; readonly value: StudioComponentCatalog }
  | { readonly ok: false; readonly issue: StudioPuckAdapterValidationIssue } {
  const catalog = createStudioComponentCatalog(input);
  if (!catalog.ok) {
    return {
      ok: false,
      issue: adapterIssue("INVALID_CATALOG", nestedPath("$.catalog", catalog.issue.path), catalog.issue.message),
    };
  }
  const compatibilityIssue = findPuckCatalogCompatibilityIssue(catalog.value);
  if (compatibilityIssue) return { ok: false, issue: compatibilityIssue };
  return { ok: true, value: catalog.value };
}

export function studioViewToPuckData(
  documentInput: unknown,
  catalogInput: unknown,
  viewId: string,
): StudioPuckDataExportResult {
  const catalog = parsePuckCatalog(catalogInput);
  if (!catalog.ok) return { ok: false, issue: catalog.issue };
  const document = validateStudioDocumentAgainstCatalog(documentInput, catalog.value);
  if (!document.ok) return exportFailure("INVALID_DOCUMENT", nestedPath("$.document", document.issue.path), document.issue.message);
  if (!isSemanticSegment(viewId)) return exportFailure("VIEW_NOT_FOUND", "$.viewId", "viewId must be a semantic Studio view id");

  const view = document.value.views.find((candidate) => candidate.id === viewId);
  if (!view) return exportFailure("VIEW_NOT_FOUND", "$.viewId", "requested Studio view does not exist");
  const components = componentMap(catalog.value);
  const byScope = new Map<string, StudioNode[]>();
  for (const node of view.nodes) {
    const key = scopeKey(node.parentId, node.slot);
    const siblings = byScope.get(key) ?? [];
    siblings.push(node);
    byScope.set(key, siblings);
  }
  for (const siblings of byScope.values()) siblings.sort((left, right) => left.order - right.order);

  const boundProps = new Map<string, string[]>();
  for (const binding of document.value.bindings) {
    if (binding.viewId !== viewId) continue;
    const key = bindingKey(binding.viewId, binding.nodeId);
    const props = boundProps.get(key) ?? [];
    props.push(binding.prop);
    boundProps.set(key, props);
  }

  function build(node: StudioNode): Record<string, unknown> {
    const component = components.get(node.component);
    if (!component) throw new Error("validated Studio component catalog invariant failed");
    const props: Record<string, unknown> = { id: node.id, ...node.props };
    for (const slot of component.slots) {
      props[slot.name] = (byScope.get(scopeKey(node.id, slot.name)) ?? []).map(build);
    }
    const readonlyProps = boundProps.get(bindingKey(viewId, node.id)) ?? [];
    return {
      type: node.component,
      props,
      ...(readonlyProps.length === 0
        ? {}
        : { readOnly: Object.fromEntries(readonlyProps.map((prop) => [prop, true] as const)) }),
    };
  }

  return {
    ok: true,
    value: {
      content: (byScope.get(scopeKey()) ?? []).map(build),
      root: { props: {} },
    } as Data,
  };
}

type PuckDataPreflight =
  | { readonly ok: true }
  | { readonly ok: false; readonly issue: StudioPuckAdapterValidationIssue };

function preflightPuckData(
  input: unknown,
  components: ReadonlyMap<string, StudioCatalogComponentDefinition>,
): PuckDataPreflight {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, issue: adapterIssue("INVALID_PUCK_DATA", "$.data", "Puck data must be a data object") };
  }
  const unknownDataField = Object.keys(input).sort().find((field) => !puckDataFields.has(field));
  if (unknownDataField) return { ok: false, issue: adapterIssue("INVALID_PUCK_DATA", `$.data.${unknownDataField}`, "unsupported Puck data field") };

  const root = ownDataValue(input, "root");
  if (root === null || typeof root !== "object" || Array.isArray(root)) {
    return { ok: false, issue: adapterIssue("INVALID_PUCK_DATA", "$.data.root", "Puck root must be an object") };
  }
  const unknownRootField = Object.keys(root).sort().find((field) => !rootDataFields.has(field));
  if (unknownRootField) return { ok: false, issue: adapterIssue("UNSUPPORTED_ROOT_DATA", `$.data.root.${unknownRootField}`, "Studio does not author Puck root fields") };
  for (const field of ["props", "readOnly"] as const) {
    const rootValue = ownDataValue(root, field);
    if (rootValue === undefined) continue;
    if (rootValue === null || typeof rootValue !== "object" || Array.isArray(rootValue) || Object.keys(rootValue).length !== 0) {
      return { ok: false, issue: adapterIssue("UNSUPPORTED_ROOT_DATA", `$.data.root.${field}`, "Studio requires empty Puck root data") };
    }
  }

  const zones = ownDataValue(input, "zones");
  if (zones !== undefined) {
    if (zones === null || typeof zones !== "object" || Array.isArray(zones)) {
      return { ok: false, issue: adapterIssue("INVALID_PUCK_DATA", "$.data.zones", "Puck zones must be an object when present") };
    }
    if (Object.keys(zones).length > 0) {
      return { ok: false, issue: adapterIssue("LEGACY_ZONES_UNSUPPORTED", "$.data.zones", "legacy Puck zones are not accepted; use inline slot fields") };
    }
  }

  const content = ownDataValue(input, "content");
  if (!Array.isArray(content)) return { ok: false, issue: adapterIssue("INVALID_PUCK_DATA", "$.data.content", "Puck content must be an array") };

  let count = 0;
  function walk(items: unknown[], path: string): StudioPuckAdapterValidationIssue | undefined {
    for (let index = 0; index < items.length; index += 1) {
      const itemDescriptor = Object.getOwnPropertyDescriptor(items, String(index));
      const itemPath = `${path}[${index}]`;
      if (!itemDescriptor || !("value" in itemDescriptor)) return adapterIssue("INVALID_COMPONENT_DATA", itemPath, "sparse/accessor Puck component data is not supported");
      const item = itemDescriptor.value;
      count += 1;
      if (count > STUDIO_MAX_NODES_PER_VIEW) return adapterIssue("NODE_LIMIT_EXCEEDED", "$.data.content", "Puck view exceeds the Studio node limit");
      if (item === null || typeof item !== "object" || Array.isArray(item)) return adapterIssue("INVALID_COMPONENT_DATA", itemPath, "Puck component data must be an object");
      const unknownItemField = Object.keys(item).sort().find((field) => !componentDataFields.has(field));
      if (unknownItemField) return adapterIssue("INVALID_COMPONENT_DATA", `${itemPath}.${unknownItemField}`, "unsupported Puck component-data field");

      const type = ownDataValue(item, "type");
      if (typeof type !== "string") return adapterIssue("INVALID_COMPONENT_DATA", `${itemPath}.type`, "Puck component type must be a string");
      const component = components.get(type);
      if (!component) return adapterIssue("UNREGISTERED_COMPONENT", `${itemPath}.type`, "Puck component is not registered in the active Studio catalog");
      const props = ownDataValue(item, "props");
      if (props === null || typeof props !== "object" || Array.isArray(props)) return adapterIssue("INVALID_COMPONENT_DATA", `${itemPath}.props`, "Puck component props must be an object");

      const allowedProps = new Set(["id", ...component.props.map((prop) => prop.key), ...component.slots.map((slot) => slot.name)]);
      const unknownProp = Object.keys(props).sort().find((field) => !allowedProps.has(field));
      if (unknownProp) return adapterIssue("INVALID_PUCK_PROP", `${itemPath}.props.${unknownProp}`, "Puck prop is not declared by the Studio catalog");
      if (!validPuckId(ownDataValue(props, "id"))) return adapterIssue("INVALID_COMPONENT_DATA", `${itemPath}.props.id`, "Puck component id must be a bounded non-empty string");

      for (const prop of component.props) {
        const value = ownDataValue(props, prop.key);
        if (value !== undefined && value !== null && typeof value === "object") {
          return adapterIssue("INVALID_PUCK_PROP", `${itemPath}.props.${prop.key}`, "Studio Puck scalar props must not contain nested values");
        }
      }
      for (const slot of component.slots) {
        const children = ownDataValue(props, slot.name);
        if (children === undefined) continue;
        if (!Array.isArray(children)) return adapterIssue("INVALID_PUCK_PROP", `${itemPath}.props.${slot.name}`, "Puck slot must contain inline ComponentData") ;
        const nested = walk(children, `${itemPath}.props.${slot.name}`);
        if (nested) return nested;
      }

      const readOnly = ownDataValue(item, "readOnly");
      if (readOnly !== undefined) {
        if (readOnly === null || typeof readOnly !== "object" || Array.isArray(readOnly)) return adapterIssue("INVALID_COMPONENT_DATA", `${itemPath}.readOnly`, "Puck readOnly must be an object");
        const allowedReadOnly = new Set([...component.props.map((prop) => prop.key), ...component.slots.map((slot) => slot.name)]);
        for (const field of Object.keys(readOnly)) {
          if (!allowedReadOnly.has(field) || ownDataValue(readOnly, field) !== true) {
            return adapterIssue("INVALID_COMPONENT_DATA", `${itemPath}.readOnly.${field}`, "readOnly accepts declared Puck fields set to true only");
          }
        }
      }
    }
    return undefined;
  }

  const walkIssue = walk(content, "$.data.content");
  return walkIssue ? { ok: false, issue: walkIssue } : { ok: true };
}

type MappingResult =
  | { readonly ok: true; readonly map: ReadonlyMap<string, string>; readonly declared: ReadonlySet<string> }
  | { readonly ok: false; readonly issue: StudioPuckAdapterValidationIssue };

function parseMappings(input: unknown): MappingResult {
  if (input === undefined) return { ok: true, map: new Map(), declared: new Set() };
  if (Array.isArray(input) && input.length > STUDIO_MAX_NODES_PER_VIEW) {
    return { ok: false, issue: adapterIssue("INVALID_ID_MAPPINGS", "$.idMappings", "id mapping count exceeds the Studio node limit") };
  }
  const parsed = parseJsonValue(input, "$.idMappings");
  if (!parsed.ok || !Array.isArray(parsed.value)) {
    return { ok: false, issue: adapterIssue("INVALID_ID_MAPPINGS", parsed.ok ? "$.idMappings" : parsed.issue.path, "idMappings must be a canonical array") };
  }

  const map = new Map<string, string>();
  const nodeIds = new Set<string>();
  for (let index = 0; index < parsed.value.length; index += 1) {
    const value = parsed.value[index];
    const base = `$.idMappings[${index}]`;
    if (!isJsonObject(value)) return { ok: false, issue: adapterIssue("INVALID_ID_MAPPINGS", base, "id mapping must be an object") };
    const unknownField = Object.keys(value).sort().find((field) => !mappingFields.has(field));
    if (unknownField) return { ok: false, issue: adapterIssue("INVALID_ID_MAPPINGS", `${base}.${unknownField}`, "unsupported id mapping field") };
    if (!validPuckId(value.puckId)) return { ok: false, issue: adapterIssue("INVALID_ID_MAPPINGS", `${base}.puckId`, "puckId must be a bounded non-empty string") };
    if (typeof value.nodeId !== "string" || !isSemanticSegment(value.nodeId)) return { ok: false, issue: adapterIssue("INVALID_ID_MAPPINGS", `${base}.nodeId`, "nodeId must be a semantic Studio node id") };
    if (map.has(value.puckId) || nodeIds.has(value.nodeId)) return { ok: false, issue: adapterIssue("DUPLICATE_ID_MAPPING", base, "id mappings must be one-to-one") };
    map.set(value.puckId, value.nodeId);
    nodeIds.add(value.nodeId);
  }
  return { ok: true, map, declared: new Set(map.keys()) };
}

export function importPuckDataIntoStudioDocument(input: {
  readonly document: unknown;
  readonly catalog: unknown;
  readonly viewId: string;
  readonly data: unknown;
  readonly idMappings?: unknown;
}): StudioPuckDataImportResult {
  const catalog = parsePuckCatalog(input.catalog);
  if (!catalog.ok) return { ok: false, issue: catalog.issue };
  const document = validateStudioDocumentAgainstCatalog(input.document, catalog.value);
  if (!document.ok) return importFailure("INVALID_DOCUMENT", nestedPath("$.document", document.issue.path), document.issue.message);
  if (!isSemanticSegment(input.viewId) || !document.value.views.some((view) => view.id === input.viewId)) {
    return importFailure("VIEW_NOT_FOUND", "$.viewId", "requested Studio view does not exist");
  }

  const components = componentMap(catalog.value);
  const preflight = preflightPuckData(input.data, components);
  if (!preflight.ok) return { ok: false, issue: preflight.issue };
  const parsed = parseJsonValue(input.data, "$.data");
  if (!parsed.ok || !isJsonObject(parsed.value) || !Array.isArray(parsed.value.content)) {
    return importFailure("INVALID_PUCK_DATA", parsed.ok ? "$.data" : parsed.issue.path, "Puck data must be canonical serializable data");
  }
  const mappings = parseMappings(input.idMappings);
  if (!mappings.ok) return { ok: false, issue: mappings.issue };
  const mappingMap = mappings.map;
  const declaredMappings = mappings.declared;

  const usedMappings = new Set<string>();
  const seenNodeIds = new Set<string>();
  const nodes: StudioNode[] = [];

  function resolveId(puckId: string, path: string): string | StudioPuckAdapterValidationIssue {
    const mapped = mappingMap.get(puckId);
    if (mapped !== undefined) {
      usedMappings.add(puckId);
      return mapped;
    }
    if (isSemanticSegment(puckId)) return puckId;
    return adapterIssue("NODE_ID_MAPPING_REQUIRED", path, "Puck-generated id is not a canonical Studio node id; provide an explicit mapping");
  }

  function walk(items: JsonArray, parentId?: string, slot?: string, path = "$.data.content"): StudioPuckAdapterValidationIssue | undefined {
    for (let index = 0; index < items.length; index += 1) {
      const value = items[index];
      const base = `${path}[${index}]`;
      if (!isJsonObject(value) || typeof value.type !== "string" || !isJsonObject(value.props) || typeof value.props.id !== "string") {
        return adapterIssue("INVALID_COMPONENT_DATA", base, "Puck component data failed canonical normalization");
      }
      const component = components.get(value.type);
      if (!component) return adapterIssue("UNREGISTERED_COMPONENT", `${base}.type`, "Puck component is not registered in the active Studio catalog");
      const nodeId = resolveId(value.props.id, `${base}.props.id`);
      if (typeof nodeId !== "string") return nodeId;
      if (seenNodeIds.has(nodeId)) return adapterIssue("DUPLICATE_NODE_ID", `${base}.props.id`, "multiple Puck components resolve to the same Studio node id");
      seenNodeIds.add(nodeId);

      const props: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
      for (const prop of component.props) {
        const propValue = value.props[prop.key];
        if (propValue !== undefined) props[prop.key] = propValue;
      }
      nodes.push({
        id: nodeId,
        component: value.type,
        order: index,
        props,
        ...(parentId === undefined ? {} : { parentId, slot: slot as string }),
      });

      for (const slotDefinition of component.slots) {
        const children = value.props[slotDefinition.name];
        if (children === undefined) continue;
        if (!Array.isArray(children)) return adapterIssue("INVALID_PUCK_PROP", `${base}.props.${slotDefinition.name}`, "Puck slot must contain inline ComponentData");
        const nested = walk(children, nodeId, slotDefinition.name, `${base}.props.${slotDefinition.name}`);
        if (nested) return nested;
      }
    }
    return undefined;
  }

  const walkIssue = walk(parsed.value.content);
  if (walkIssue) return { ok: false, issue: walkIssue };
  for (const puckId of declaredMappings) {
    if (!usedMappings.has(puckId)) return importFailure("UNUSED_ID_MAPPING", "$.idMappings", "idMappings contains a puckId not present in this Puck view");
  }

  const importedView: StudioView = { id: input.viewId, nodes };
  const candidate: StudioExperienceDocument = {
    version: document.value.version,
    id: document.value.id,
    recipeId: document.value.recipeId,
    entryView: document.value.entryView,
    views: document.value.views.map((view) => view.id === input.viewId ? importedView : view),
    bindings: document.value.bindings,
    interactions: document.value.interactions,
  };
  const normalized = parseStudioExperienceDocument(candidate);
  if (!normalized.ok) return importFailure("INVALID_IMPORTED_DOCUMENT", nestedPath("$.document", normalized.issue.path), normalized.issue.message);
  const validated = validateStudioDocumentAgainstCatalog(normalized.value, catalog.value);
  if (!validated.ok) return importFailure("INVALID_IMPORTED_DOCUMENT", nestedPath("$.document", validated.issue.path), validated.issue.message);
  return { ok: true, value: validated.value };
}
