import { isSemanticSegment, parseJsonValue } from "@vira-enterprise-genui/protocol";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import { parseStudioExperienceDocument } from "@vira-enterprise-genui/studio-schema";
import { createStudioComponentCatalog as legacyCreate, resolveStudioCatalogComponent as legacyResolve, validateStudioDocumentAgainstCatalog as legacyValidate } from "./validate.js";
import { STUDIO_CATALOG_MAX_ENUM_OPTIONS, STUDIO_CATALOG_MAX_EVENT_PAYLOAD_FIELDS, STUDIO_CATALOG_LABEL_MAX_LENGTH } from "./types.js";
import type { ResolveStudioCatalogComponentResult, StudioCatalogDocumentValidationResult, StudioCatalogEventPayloadDefinition, StudioCatalogPropType, StudioComponentCatalog, StudioComponentCatalogResult, StudioComponentCatalogValidationCode } from "./types.js";

function catalogFailure(code: StudioComponentCatalogValidationCode, path: string, message: string): StudioComponentCatalogResult { return { ok: false, issue: { code, path, message } }; }
function documentFailure(code: "INVALID_CATALOG" | "INVALID_DOCUMENT" | "UNDECLARED_EVENT" | "UNKNOWN_EVENT_PAYLOAD" | "INVALID_EVENT_PAYLOAD_VALUE" | "MISSING_EVENT_PAYLOAD", path: string, message: string): StudioCatalogDocumentValidationResult { return { ok: false, issue: { code, path, message } }; }
function isObject(value: JsonValue | undefined): value is JsonObject { return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value); }
function freeze<T>(value: T): T { if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value; if (Array.isArray(value)) { for (const item of value) freeze(item); return Object.freeze(value); } const record = value as Record<string, unknown>; for (const key of Object.keys(record)) freeze(record[key]); return Object.freeze(value); }
function validLabel(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= STUDIO_CATALOG_LABEL_MAX_LENGTH && value.trim() === value; }
function accepts(type: StudioCatalogPropType, options: readonly string[] | undefined, value: JsonValue): boolean { if (type === "string") return typeof value === "string"; if (type === "number") return typeof value === "number"; if (type === "boolean") return typeof value === "boolean"; return typeof value === "string" && (options?.includes(value) ?? false); }

function payloadDefinition(value: JsonValue, path: string): { readonly ok: true; readonly value: StudioCatalogEventPayloadDefinition } | { readonly ok: false; readonly result: StudioComponentCatalogResult } {
  if (!isObject(value)) return { ok: false, result: catalogFailure("INVALID_EVENT_PAYLOAD", path, "event payload definition must be an object") };
  const allowed = new Set(["key", "type", "required", "options"]); const unknown = Object.keys(value).sort().find((key) => !allowed.has(key)); if (unknown) return { ok: false, result: catalogFailure("INVALID_EVENT_PAYLOAD", `${path}.${unknown}`, `unknown event payload field: ${unknown}`) };
  if (typeof value.key !== "string" || !isSemanticSegment(value.key)) return { ok: false, result: catalogFailure("INVALID_EVENT_PAYLOAD", `${path}.key`, "payload key must be one semantic segment") };
  if (value.type !== "string" && value.type !== "number" && value.type !== "boolean" && value.type !== "enum") return { ok: false, result: catalogFailure("INVALID_EVENT_PAYLOAD", `${path}.type`, "unsupported event payload type") };
  if (typeof value.required !== "boolean") return { ok: false, result: catalogFailure("INVALID_EVENT_PAYLOAD", `${path}.required`, "required must be boolean") };
  let options: readonly string[] | undefined;
  if (value.type === "enum") {
    if (!Array.isArray(value.options) || value.options.length === 0 || value.options.length > STUDIO_CATALOG_MAX_ENUM_OPTIONS) return { ok: false, result: catalogFailure("INVALID_EVENT_PAYLOAD", `${path}.options`, "enum payload requires bounded options") };
    const normalized: string[] = []; const seen = new Set<string>(); for (let index = 0; index < value.options.length; index += 1) { const item = value.options[index]; if (!validLabel(item) || seen.has(item)) return { ok: false, result: catalogFailure("INVALID_EVENT_PAYLOAD", `${path}.options[${index}]`, "enum payload options must be unique labels") }; seen.add(item); normalized.push(item); } options = normalized;
  } else if (Object.hasOwn(value, "options")) return { ok: false, result: catalogFailure("INVALID_EVENT_PAYLOAD", `${path}.options`, "options are allowed only for enum payloads") };
  return { ok: true, value: { key: value.key, type: value.type, required: value.required, ...(options ? { options } : {}) } };
}

function sanitize(input: unknown): { readonly ok: true; readonly legacy: unknown; readonly payloads: ReadonlyMap<string, readonly StudioCatalogEventPayloadDefinition[]> } | { readonly ok: false; readonly result: StudioComponentCatalogResult } {
  const parsed = parseJsonValue(input); if (!parsed.ok || !isObject(parsed.value)) return { ok: true, legacy: input, payloads: new Map() };
  const legacy = structuredClone(parsed.value) as JsonObject; const payloads = new Map<string, readonly StudioCatalogEventPayloadDefinition[]>();
  if (!Array.isArray(legacy.components)) return { ok: true, legacy, payloads };
  for (let ci = 0; ci < legacy.components.length; ci += 1) { const component = legacy.components[ci]; if (!isObject(component) || !Array.isArray(component.events)) continue;
    for (let ei = 0; ei < component.events.length; ei += 1) { const event = component.events[ei]; if (!isObject(event) || !Object.hasOwn(event, "payload")) continue; const path = `$.components[${ci}].events[${ei}].payload`; if (!Array.isArray(event.payload) || event.payload.length > STUDIO_CATALOG_MAX_EVENT_PAYLOAD_FIELDS) return { ok: false, result: catalogFailure("INVALID_EVENT_PAYLOAD", path, "event payload must be a bounded array") };
      const definitions: StudioCatalogEventPayloadDefinition[] = []; const keys = new Set<string>(); for (let pi = 0; pi < event.payload.length; pi += 1) { const result = payloadDefinition(event.payload[pi] as JsonValue, `${path}[${pi}]`); if (!result.ok) return result; if (keys.has(result.value.key)) return { ok: false, result: catalogFailure("INVALID_EVENT_PAYLOAD", `${path}[${pi}].key`, "duplicate event payload key") }; keys.add(result.value.key); definitions.push(result.value); }
      payloads.set(`${ci}:${ei}`, definitions); delete event.payload;
    }
  }
  return { ok: true, legacy, payloads };
}

function legacyCatalog(catalog: StudioComponentCatalog): unknown { return { ...catalog, components: catalog.components.map((component) => ({ ...component, events: component.events.map((event) => ({ name: event.name, label: event.label })) })) }; }

export function createStudioComponentCatalog(input: unknown): StudioComponentCatalogResult {
  const prepared = sanitize(input); if (!prepared.ok) return prepared.result; const result = legacyCreate(prepared.legacy); if (!result.ok) return result;
  const components = result.value.components.map((component, ci) => ({ ...component, events: component.events.map((event, ei) => { const payload = prepared.payloads.get(`${ci}:${ei}`); return payload === undefined ? event : { ...event, payload }; }) }));
  return { ok: true, value: freeze({ ...result.value, components }) };
}

export function resolveStudioCatalogComponent(catalogInput: unknown, componentRef: string): ResolveStudioCatalogComponentResult { const catalog = createStudioComponentCatalog(catalogInput); if (!catalog.ok) return { ok: false, issue: { code: "INVALID_CATALOG", path: `$.catalog${catalog.issue.path.slice(1)}`, message: catalog.issue.message } }; const component = catalog.value.components.find((candidate) => candidate.ref === componentRef); return component ? { ok: true, value: component } : legacyResolve(legacyCatalog(catalog.value), componentRef); }

export function validateStudioDocumentAgainstCatalog(documentInput: unknown, catalogInput: unknown): StudioCatalogDocumentValidationResult {
  const catalog = createStudioComponentCatalog(catalogInput); if (!catalog.ok) return documentFailure("INVALID_CATALOG", `$.catalog${catalog.issue.path.slice(1)}`, catalog.issue.message);
  const base = legacyValidate(documentInput, legacyCatalog(catalog.value)); if (!base.ok) return base;
  const document = parseStudioExperienceDocument(base.value); if (!document.ok) return documentFailure("INVALID_DOCUMENT", `$.document${document.issue.path.slice(1)}`, document.issue.message);
  for (let index = 0; index < document.value.interactions.length; index += 1) { const interaction = document.value.interactions[index]; if (!interaction) continue; const node = document.value.views.find((view) => view.id === interaction.viewId)?.nodes.find((candidate) => candidate.id === interaction.nodeId); const component = catalog.value.components.find((candidate) => candidate.ref === node?.component); const event = component?.events.find((candidate) => candidate.name === interaction.event); if (!event) return documentFailure("UNDECLARED_EVENT", `$.document.interactions[${index}].event`, "component does not declare this event"); const definitions = event.payload ?? []; const byKey = new Map(definitions.map((definition) => [definition.key, definition] as const)); const mapped = new Set<string>();
    for (let pi = 0; pi < (interaction.payloadBindings?.length ?? 0); pi += 1) { const binding = interaction.payloadBindings?.[pi]; if (!binding) continue; const definition = byKey.get(binding.key); if (!definition) return documentFailure("UNKNOWN_EVENT_PAYLOAD", `$.document.interactions[${index}].payloadBindings[${pi}].key`, "payload key is not declared by the component event"); mapped.add(binding.key); if (binding.source.kind === "literal" && !accepts(definition.type, definition.options, binding.source.value)) return documentFailure("INVALID_EVENT_PAYLOAD_VALUE", `$.document.interactions[${index}].payloadBindings[${pi}].source.value`, "literal payload value does not match event payload type"); }
    const missing = definitions.find((definition) => definition.required && !mapped.has(definition.key)); if (missing) return documentFailure("MISSING_EVENT_PAYLOAD", `$.document.interactions[${index}].payloadBindings`, `required event payload is not mapped: ${missing.key}`);
  }
  return { ok: true, value: document.value };
}
