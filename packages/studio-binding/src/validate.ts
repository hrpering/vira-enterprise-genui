import {
  isSemanticNamespace,
  parseJsonValue,
} from "@vira-enterprise-genui/protocol";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import {
  createStudioComponentCatalog,
  validateStudioDocumentAgainstCatalog,
} from "@vira-enterprise-genui/studio-catalog";
import type {
  StudioCatalogComponentDefinition,
  StudioCatalogPropDefinition,
  StudioComponentCatalog,
} from "@vira-enterprise-genui/studio-catalog";
import { parseStudioExperienceDocument } from "@vira-enterprise-genui/studio-schema";
import type {
  StudioBinding,
  StudioBindingSource,
  StudioExperienceDocument,
  StudioNode,
} from "@vira-enterprise-genui/studio-schema";
import {
  STUDIO_BINDING_LABEL_MAX_LENGTH,
  STUDIO_BINDING_MAX_SOURCES,
  STUDIO_BINDING_SOURCE_CATALOG_VERSION,
} from "./types.js";
import type {
  StudioBindingDocumentResult,
  StudioBindingSourceCatalog,
  StudioBindingSourceCatalogResult,
  StudioBindingSourceDefinition,
  StudioBindingTargetOption,
  StudioBindingTargetsResult,
  StudioBindingValidationCode,
  StudioBindingValueType,
} from "./types.js";

const rootFields = new Set(["version", "id", "sources"]);
const sourceFields = new Set(["kind", "path", "label", "valueType"]);
const valueTypes = new Set<StudioBindingValueType>(["string", "number", "boolean", "enum"]);
const controlCharacterPattern = /[\u0000-\u001F\u007F]/;

function failure(code: StudioBindingValidationCode, path: string, message: string): StudioBindingSourceCatalogResult {
  return { ok: false, issue: { code, path, message } };
}

function documentFailure(code: StudioBindingValidationCode, path: string, message: string): StudioBindingDocumentResult {
  return { ok: false, issue: { code, path, message } };
}

function targetsFailure(code: StudioBindingValidationCode, path: string, message: string): StudioBindingTargetsResult {
  return { ok: false, issue: { code, path, message } };
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function validLabel(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= STUDIO_BINDING_LABEL_MAX_LENGTH
    && value.trim() === value
    && !controlCharacterPattern.test(value);
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

function sourceKey(source: Pick<StudioBindingSourceDefinition, "kind" | "path">): string {
  return `${source.kind}:${source.path}`;
}

function compatible(prop: StudioCatalogPropDefinition, source: StudioBindingSourceDefinition): boolean {
  return prop.type === source.valueType;
}

function nestedPath(base: string, path: string): string {
  return path === "$" ? base : `${base}${path.slice(1)}`;
}

function preflight(input: unknown): StudioBindingSourceCatalogResult | undefined {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(input, "sources");
  if (!descriptor || !("value" in descriptor) || !Array.isArray(descriptor.value)) return undefined;
  if (descriptor.value.length > STUDIO_BINDING_MAX_SOURCES) {
    return failure("SOURCE_LIMIT_EXCEEDED", "$.sources", `binding source catalog allows at most ${STUDIO_BINDING_MAX_SOURCES} sources`);
  }
  return undefined;
}

export function createStudioBindingSourceCatalog(input: unknown): StudioBindingSourceCatalogResult {
  const preflightResult = preflight(input);
  if (preflightResult) return preflightResult;
  const parsed = parseJsonValue(input);
  if (!parsed.ok) return failure("INVALID_TYPE", parsed.issue.path, parsed.issue.reason);
  if (!isJsonObject(parsed.value)) return failure("INVALID_TYPE", "$", "binding source catalog must be a canonical JSON object");
  const fields = parsed.value;
  const unknown = Object.keys(fields).sort().find((field) => !rootFields.has(field));
  if (unknown) return failure("UNKNOWN_FIELD", `$.${unknown}`, `unknown binding source catalog field: ${unknown}`);
  if (fields.version !== STUDIO_BINDING_SOURCE_CATALOG_VERSION) return failure("INVALID_VERSION", "$.version", `binding source catalog version must be ${STUDIO_BINDING_SOURCE_CATALOG_VERSION}`);
  if (typeof fields.id !== "string" || !isSemanticNamespace(fields.id)) return failure("INVALID_ID", "$.id", "binding source catalog id must be a semantic namespace");
  if (!Array.isArray(fields.sources)) return failure("INVALID_SOURCES", "$.sources", "sources must be an array");
  if (fields.sources.length > STUDIO_BINDING_MAX_SOURCES) return failure("SOURCE_LIMIT_EXCEEDED", "$.sources", `binding source catalog allows at most ${STUDIO_BINDING_MAX_SOURCES} sources`);

  const sources: StudioBindingSourceDefinition[] = [];
  const identities = new Set<string>();
  for (let index = 0; index < fields.sources.length; index += 1) {
    const raw = fields.sources[index];
    const base = `$.sources[${index}]`;
    if (!isJsonObject(raw)) return failure("INVALID_SOURCE", base, "binding source must be a canonical JSON object");
    const unknownSource = Object.keys(raw).sort().find((field) => !sourceFields.has(field));
    if (unknownSource) return failure("UNKNOWN_FIELD", `${base}.${unknownSource}`, `unknown binding source field: ${unknownSource}`);
    if (raw.kind !== "state" && raw.kind !== "domain") return failure("INVALID_SOURCE", `${base}.kind`, "binding source kind must be state or domain");
    if (typeof raw.path !== "string" || !isSemanticNamespace(raw.path)) return failure("INVALID_SOURCE", `${base}.path`, "binding source path must be a semantic namespace");
    if (!validLabel(raw.label)) return failure("INVALID_LABEL", `${base}.label`, "binding source label must be a bounded trimmed string");
    if (typeof raw.valueType !== "string" || !valueTypes.has(raw.valueType as StudioBindingValueType)) return failure("INVALID_VALUE_TYPE", `${base}.valueType`, "binding source valueType must be string, number, boolean, or enum");
    const identity = `${raw.kind}:${raw.path}`;
    if (identities.has(identity)) return failure("DUPLICATE_SOURCE", base, "duplicate binding source identity");
    identities.add(identity);
    sources.push({
      kind: raw.kind,
      path: raw.path,
      label: raw.label,
      valueType: raw.valueType as StudioBindingValueType,
    });
  }
  return {
    ok: true,
    value: freezeData({ version: STUDIO_BINDING_SOURCE_CATALOG_VERSION, id: fields.id, sources }),
  };
}

function componentMap(catalog: StudioComponentCatalog): ReadonlyMap<string, StudioCatalogComponentDefinition> {
  return new Map(catalog.components.map((component) => [component.ref, component] as const));
}

function nodeFor(document: StudioExperienceDocument, viewId: string, nodeId: string): StudioNode | undefined {
  return document.views.find((view) => view.id === viewId)?.nodes.find((node) => node.id === nodeId);
}

function validateInputs(
  documentInput: unknown,
  componentCatalogInput: unknown,
  sourceCatalogInput: unknown,
):
  | { readonly ok: true; readonly document: StudioExperienceDocument; readonly components: StudioComponentCatalog; readonly sources: StudioBindingSourceCatalog }
  | { readonly ok: false; readonly issue: { readonly code: StudioBindingValidationCode; readonly path: string; readonly message: string } } {
  const sourceCatalog = createStudioBindingSourceCatalog(sourceCatalogInput);
  if (!sourceCatalog.ok) return sourceCatalog;
  const componentCatalog = createStudioComponentCatalog(componentCatalogInput);
  if (!componentCatalog.ok) {
    return { ok: false, issue: { code: "INVALID_COMPONENT_CATALOG", path: nestedPath("$.componentCatalog", componentCatalog.issue.path), message: componentCatalog.issue.message } };
  }
  const document = validateStudioDocumentAgainstCatalog(documentInput, componentCatalog.value);
  if (!document.ok) {
    return { ok: false, issue: { code: "INVALID_DOCUMENT", path: nestedPath("$.document", document.issue.path), message: document.issue.message } };
  }
  return { ok: true, document: document.value, components: componentCatalog.value, sources: sourceCatalog.value };
}

export function validateStudioDocumentBindings(
  documentInput: unknown,
  componentCatalogInput: unknown,
  sourceCatalogInput: unknown,
): StudioBindingDocumentResult {
  const inputs = validateInputs(documentInput, componentCatalogInput, sourceCatalogInput);
  if (!inputs.ok) return { ok: false, issue: inputs.issue };
  const sources = new Map(inputs.sources.sources.map((source) => [sourceKey(source), source] as const));
  const components = componentMap(inputs.components);
  for (let index = 0; index < inputs.document.bindings.length; index += 1) {
    const binding = inputs.document.bindings[index];
    if (!binding) continue;
    const source = sources.get(sourceKey(binding.source));
    if (!source) return documentFailure("UNREGISTERED_SOURCE", `$.document.bindings[${index}].source`, "binding source is not registered in the active source catalog");
    const node = nodeFor(inputs.document, binding.viewId, binding.nodeId);
    if (!node) return documentFailure("TARGET_NOT_FOUND", `$.document.bindings[${index}]`, "binding target does not exist");
    const prop = components.get(node.component)?.props.find((candidate) => candidate.key === binding.prop);
    if (!prop || !prop.bindable) return documentFailure("UNBINDABLE_PROP", `$.document.bindings[${index}].prop`, "binding target prop is not bindable");
    if (!compatible(prop, source)) return documentFailure("INCOMPATIBLE_SOURCE", `$.document.bindings[${index}].source`, "binding source value type is incompatible with the target prop");
  }
  return { ok: true, value: inputs.document };
}

export function getStudioBindingTargets(
  documentInput: unknown,
  componentCatalogInput: unknown,
  sourceCatalogInput: unknown,
  viewId: string,
  nodeId: string,
): StudioBindingTargetsResult {
  const validated = validateStudioDocumentBindings(documentInput, componentCatalogInput, sourceCatalogInput);
  if (!validated.ok) return { ok: false, issue: validated.issue };
  const componentCatalog = createStudioComponentCatalog(componentCatalogInput);
  const sourceCatalog = createStudioBindingSourceCatalog(sourceCatalogInput);
  if (!componentCatalog.ok || !sourceCatalog.ok) return targetsFailure("INVALID_TYPE", "$", "validated binding inputs became unavailable");
  const node = nodeFor(validated.value, viewId, nodeId);
  if (!node) return targetsFailure("TARGET_NOT_FOUND", "$.nodeId", "Studio binding target node does not exist");
  const component = componentCatalog.value.components.find((candidate) => candidate.ref === node.component);
  if (!component) return targetsFailure("TARGET_NOT_FOUND", "$.nodeId", "Studio component metadata does not exist");
  const current = new Map(validated.value.bindings.filter((binding) => binding.viewId === viewId && binding.nodeId === nodeId).map((binding) => [binding.prop, binding.source] as const));
  const targets: StudioBindingTargetOption[] = component.props
    .filter((prop) => prop.bindable)
    .map((prop) => ({
      prop: prop.key,
      valueType: prop.type,
      required: prop.required,
      compatibleSources: sourceCatalog.value.sources.filter((source) => compatible(prop, source)),
      ...(current.get(prop.key) === undefined ? {} : { currentSource: current.get(prop.key) as StudioBindingSource }),
    }));
  return { ok: true, value: freezeData(targets) };
}

function mutateBinding(input: {
  readonly document: unknown;
  readonly componentCatalog: unknown;
  readonly sourceCatalog: unknown;
  readonly viewId: string;
  readonly nodeId: string;
  readonly prop: string;
  readonly source?: StudioBindingSource;
}): StudioBindingDocumentResult {
  const inputs = validateInputs(input.document, input.componentCatalog, input.sourceCatalog);
  if (!inputs.ok) return { ok: false, issue: inputs.issue };
  const node = nodeFor(inputs.document, input.viewId, input.nodeId);
  if (!node) return documentFailure("TARGET_NOT_FOUND", "$.nodeId", "Studio binding target node does not exist");
  const component = componentMap(inputs.components).get(node.component);
  const prop = component?.props.find((candidate) => candidate.key === input.prop);
  if (!prop || !prop.bindable) return documentFailure("UNBINDABLE_PROP", "$.prop", "Studio prop is not bindable");

  let nextBindings: StudioBinding[] = inputs.document.bindings.filter((binding) => !(binding.viewId === input.viewId && binding.nodeId === input.nodeId && binding.prop === input.prop));
  let nextViews = inputs.document.views.map((view) => ({ ...view, nodes: [...view.nodes] }));
  if (input.source !== undefined) {
    const source = inputs.sources.sources.find((candidate) => sourceKey(candidate) === sourceKey(input.source));
    if (!source) return documentFailure("UNREGISTERED_SOURCE", "$.source", "selected binding source is not registered");
    if (!compatible(prop, source)) return documentFailure("INCOMPATIBLE_SOURCE", "$.source", "selected binding source is incompatible with the target prop");
    nextBindings = [...nextBindings, { viewId: input.viewId, nodeId: input.nodeId, prop: input.prop, source: { kind: source.kind, path: source.path } }];
    nextViews = nextViews.map((view) => view.id !== input.viewId ? view : {
      ...view,
      nodes: view.nodes.map((candidate) => candidate.id !== input.nodeId ? candidate : (() => {
        const props = { ...candidate.props } as Record<string, JsonValue>;
        delete props[input.prop];
        return { ...candidate, props };
      })()),
    });
  }

  const candidate = {
    ...inputs.document,
    views: nextViews,
    bindings: nextBindings,
  };
  const parsed = parseStudioExperienceDocument(candidate);
  if (!parsed.ok) {
    const code = input.source === undefined && prop.required ? "REQUIRED_VALUE_MISSING" : "INVALID_DOCUMENT";
    return documentFailure(code, nestedPath("$.document", parsed.issue.path), parsed.issue.message);
  }
  const componentValidated = validateStudioDocumentAgainstCatalog(parsed.value, inputs.components);
  if (!componentValidated.ok) {
    const code = input.source === undefined && prop.required ? "REQUIRED_VALUE_MISSING" : "INVALID_DOCUMENT";
    return documentFailure(code, nestedPath("$.document", componentValidated.issue.path), componentValidated.issue.message);
  }
  return validateStudioDocumentBindings(componentValidated.value, inputs.components, inputs.sources);
}

export function setStudioBinding(input: {
  readonly document: unknown;
  readonly componentCatalog: unknown;
  readonly sourceCatalog: unknown;
  readonly viewId: string;
  readonly nodeId: string;
  readonly prop: string;
  readonly source: StudioBindingSource;
}): StudioBindingDocumentResult {
  return mutateBinding(input);
}

export function clearStudioBinding(input: {
  readonly document: unknown;
  readonly componentCatalog: unknown;
  readonly sourceCatalog: unknown;
  readonly viewId: string;
  readonly nodeId: string;
  readonly prop: string;
}): StudioBindingDocumentResult {
  return mutateBinding(input);
}
