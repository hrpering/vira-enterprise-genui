import { isSemanticSegment, parseJsonValue } from "@vira-enterprise-genui/protocol";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import { parseStudioExperienceDocument } from "@vira-enterprise-genui/studio-schema";
import {
  createStudioComponentCatalog as legacyCreate,
  resolveStudioCatalogComponent as legacyResolve,
  validateStudioDocumentAgainstCatalog as legacyValidate,
} from "./validate.js";
import {
  STUDIO_CATALOG_MAX_ENUM_OPTIONS,
  STUDIO_CATALOG_MAX_EVENT_PAYLOAD_FIELDS,
  STUDIO_CATALOG_LABEL_MAX_LENGTH,
} from "./types.js";
import type {
  ResolveStudioCatalogComponentResult,
  StudioCatalogDocumentValidationResult,
  StudioCatalogEventPayloadDefinition,
  StudioCatalogPropType,
  StudioComponentCatalog,
  StudioComponentCatalogResult,
  StudioComponentCatalogValidationCode,
} from "./types.js";

type MutableJsonObject = { [key: string]: JsonValue };

type PayloadDocumentCode =
  | "INVALID_CATALOG"
  | "INVALID_DOCUMENT"
  | "UNDECLARED_EVENT"
  | "UNKNOWN_EVENT_PAYLOAD"
  | "INVALID_EVENT_PAYLOAD_VALUE"
  | "MISSING_EVENT_PAYLOAD";

function catalogFailure(
  code: StudioComponentCatalogValidationCode,
  path: string,
  message: string,
): StudioComponentCatalogResult {
  return { ok: false, issue: { code, path, message } };
}

function documentFailure(
  code: PayloadDocumentCode,
  path: string,
  message: string,
): StudioCatalogDocumentValidationResult {
  return { ok: false, issue: { code, path, message } };
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

function mutableObject(value: JsonValue | undefined): MutableJsonObject | undefined {
  return isObject(value) ? value as MutableJsonObject : undefined;
}

function freeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) freeze(item);
    return Object.freeze(value);
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) freeze(record[key]);
  return Object.freeze(value);
}

function validLabel(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= STUDIO_CATALOG_LABEL_MAX_LENGTH
    && value.trim() === value;
}

function accepts(
  type: StudioCatalogPropType,
  options: readonly string[] | undefined,
  value: JsonValue,
): boolean {
  if (type === "string") return typeof value === "string";
  if (type === "number") return typeof value === "number";
  if (type === "boolean") return typeof value === "boolean";
  return typeof value === "string" && (options?.includes(value) ?? false);
}

function payloadDefinition(
  value: JsonValue,
  path: string,
):
  | { readonly ok: true; readonly value: StudioCatalogEventPayloadDefinition }
  | { readonly ok: false; readonly result: StudioComponentCatalogResult } {
  if (!isObject(value)) {
    return {
      ok: false,
      result: catalogFailure("INVALID_EVENT_PAYLOAD", path, "event payload definition must be an object"),
    };
  }
  const allowed = new Set(["key", "type", "required", "options"]);
  const unknown = Object.keys(value).sort().find((key) => !allowed.has(key));
  if (unknown) {
    return {
      ok: false,
      result: catalogFailure("INVALID_EVENT_PAYLOAD", `${path}.${unknown}`, `unknown event payload field: ${unknown}`),
    };
  }
  if (typeof value.key !== "string" || !isSemanticSegment(value.key)) {
    return {
      ok: false,
      result: catalogFailure("INVALID_EVENT_PAYLOAD", `${path}.key`, "payload key must be one semantic segment"),
    };
  }
  if (value.type !== "string" && value.type !== "number" && value.type !== "boolean" && value.type !== "enum") {
    return {
      ok: false,
      result: catalogFailure("INVALID_EVENT_PAYLOAD", `${path}.type`, "unsupported event payload type"),
    };
  }
  if (typeof value.required !== "boolean") {
    return {
      ok: false,
      result: catalogFailure("INVALID_EVENT_PAYLOAD", `${path}.required`, "required must be boolean"),
    };
  }

  let options: readonly string[] | undefined;
  if (value.type === "enum") {
    if (
      !Array.isArray(value.options)
      || value.options.length === 0
      || value.options.length > STUDIO_CATALOG_MAX_ENUM_OPTIONS
    ) {
      return {
        ok: false,
        result: catalogFailure("INVALID_EVENT_PAYLOAD", `${path}.options`, "enum payload requires bounded options"),
      };
    }
    const normalized: string[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < value.options.length; index += 1) {
      const item = value.options[index];
      if (!validLabel(item) || seen.has(item)) {
        return {
          ok: false,
          result: catalogFailure(
            "INVALID_EVENT_PAYLOAD",
            `${path}.options[${index}]`,
            "enum payload options must be unique labels",
          ),
        };
      }
      seen.add(item);
      normalized.push(item);
    }
    options = normalized;
  } else if (Object.hasOwn(value, "options")) {
    return {
      ok: false,
      result: catalogFailure("INVALID_EVENT_PAYLOAD", `${path}.options`, "options are allowed only for enum payloads"),
    };
  }

  return {
    ok: true,
    value: {
      key: value.key,
      type: value.type,
      required: value.required,
      ...(options ? { options } : {}),
    },
  };
}

function sanitize(input: unknown):
  | {
      readonly ok: true;
      readonly legacy: unknown;
      readonly payloads: ReadonlyMap<string, readonly StudioCatalogEventPayloadDefinition[]>;
    }
  | { readonly ok: false; readonly result: StudioComponentCatalogResult } {
  const parsed = parseJsonValue(input);
  if (!parsed.ok || !isObject(parsed.value)) {
    return { ok: true, legacy: input, payloads: new Map() };
  }

  const legacy = structuredClone(parsed.value) as MutableJsonObject;
  const payloads = new Map<string, readonly StudioCatalogEventPayloadDefinition[]>();
  const components = legacy.components;
  if (!Array.isArray(components)) return { ok: true, legacy, payloads };

  for (let componentIndex = 0; componentIndex < components.length; componentIndex += 1) {
    const component = mutableObject(components[componentIndex]);
    const events = component?.events;
    if (!component || !Array.isArray(events)) continue;

    for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
      const event = mutableObject(events[eventIndex]);
      if (!event || !Object.hasOwn(event, "payload")) continue;
      const path = `$.components[${componentIndex}].events[${eventIndex}].payload`;
      const rawPayload = event.payload;
      if (!Array.isArray(rawPayload) || rawPayload.length > STUDIO_CATALOG_MAX_EVENT_PAYLOAD_FIELDS) {
        return {
          ok: false,
          result: catalogFailure("INVALID_EVENT_PAYLOAD", path, "event payload must be a bounded array"),
        };
      }

      const definitions: StudioCatalogEventPayloadDefinition[] = [];
      const keys = new Set<string>();
      for (let payloadIndex = 0; payloadIndex < rawPayload.length; payloadIndex += 1) {
        const result = payloadDefinition(rawPayload[payloadIndex] as JsonValue, `${path}[${payloadIndex}]`);
        if (!result.ok) return result;
        if (keys.has(result.value.key)) {
          return {
            ok: false,
            result: catalogFailure(
              "INVALID_EVENT_PAYLOAD",
              `${path}[${payloadIndex}].key`,
              "duplicate event payload key",
            ),
          };
        }
        keys.add(result.value.key);
        definitions.push(result.value);
      }
      payloads.set(`${componentIndex}:${eventIndex}`, definitions);
      delete event.payload;
    }
  }

  return { ok: true, legacy, payloads };
}

function legacyCatalog(catalog: StudioComponentCatalog): unknown {
  return {
    ...catalog,
    components: catalog.components.map((component) => ({
      ...component,
      events: component.events.map((event) => ({ name: event.name, label: event.label })),
    })),
  };
}

export function createStudioComponentCatalog(input: unknown): StudioComponentCatalogResult {
  const prepared = sanitize(input);
  if (!prepared.ok) return prepared.result;
  const result = legacyCreate(prepared.legacy);
  if (!result.ok) return result;

  const components = result.value.components.map((component, componentIndex) => ({
    ...component,
    events: component.events.map((event, eventIndex) => {
      const payload = prepared.payloads.get(`${componentIndex}:${eventIndex}`);
      return payload === undefined ? event : { ...event, payload };
    }),
  }));
  return { ok: true, value: freeze({ ...result.value, components }) };
}

export function resolveStudioCatalogComponent(
  catalogInput: unknown,
  componentRef: string,
): ResolveStudioCatalogComponentResult {
  const catalog = createStudioComponentCatalog(catalogInput);
  if (!catalog.ok) {
    return {
      ok: false,
      issue: {
        code: "INVALID_CATALOG",
        path: `$.catalog${catalog.issue.path.slice(1)}`,
        message: catalog.issue.message,
      },
    };
  }
  const component = catalog.value.components.find((candidate) => candidate.ref === componentRef);
  return component
    ? { ok: true, value: component }
    : legacyResolve(legacyCatalog(catalog.value), componentRef);
}

function validatePayloadShape(
  documentInput: unknown,
  catalogInput: unknown,
  requireComplete: boolean,
): StudioCatalogDocumentValidationResult {
  const catalog = createStudioComponentCatalog(catalogInput);
  if (!catalog.ok) {
    return documentFailure(
      "INVALID_CATALOG",
      `$.catalog${catalog.issue.path.slice(1)}`,
      catalog.issue.message,
    );
  }

  const base = legacyValidate(documentInput, legacyCatalog(catalog.value));
  if (!base.ok) return base;
  const document = parseStudioExperienceDocument(base.value);
  if (!document.ok) {
    return documentFailure(
      "INVALID_DOCUMENT",
      `$.document${document.issue.path.slice(1)}`,
      document.issue.message,
    );
  }

  for (let interactionIndex = 0; interactionIndex < document.value.interactions.length; interactionIndex += 1) {
    const interaction = document.value.interactions[interactionIndex];
    if (!interaction) continue;
    const node = document.value.views
      .find((view) => view.id === interaction.viewId)
      ?.nodes.find((candidate) => candidate.id === interaction.nodeId);
    const component = catalog.value.components.find((candidate) => candidate.ref === node?.component);
    const event = component?.events.find((candidate) => candidate.name === interaction.event);
    if (!event) {
      return documentFailure(
        "UNDECLARED_EVENT",
        `$.document.interactions[${interactionIndex}].event`,
        "component does not declare this event",
      );
    }

    const definitions = event.payload ?? [];
    const byKey = new Map(definitions.map((definition) => [definition.key, definition] as const));
    const mapped = new Set<string>();
    const bindings = interaction.payloadBindings ?? [];
    for (let payloadIndex = 0; payloadIndex < bindings.length; payloadIndex += 1) {
      const binding = bindings[payloadIndex];
      if (!binding) continue;
      const definition = byKey.get(binding.key);
      if (!definition) {
        return documentFailure(
          "UNKNOWN_EVENT_PAYLOAD",
          `$.document.interactions[${interactionIndex}].payloadBindings[${payloadIndex}].key`,
          "payload key is not declared by the component event",
        );
      }
      mapped.add(binding.key);
      if (
        binding.source.kind === "literal"
        && !accepts(definition.type, definition.options, binding.source.value)
      ) {
        return documentFailure(
          "INVALID_EVENT_PAYLOAD_VALUE",
          `$.document.interactions[${interactionIndex}].payloadBindings[${payloadIndex}].source.value`,
          "literal payload value does not match event payload type",
        );
      }
    }

    if (requireComplete) {
      const missing = definitions.find((definition) => definition.required && !mapped.has(definition.key));
      if (missing) {
        return documentFailure(
          "MISSING_EVENT_PAYLOAD",
          `$.document.interactions[${interactionIndex}].payloadBindings`,
          `required event payload is not mapped: ${missing.key}`,
        );
      }
    }
  }

  return { ok: true, value: document.value };
}

export function validateStudioDocumentAgainstCatalog(
  documentInput: unknown,
  catalogInput: unknown,
): StudioCatalogDocumentValidationResult {
  return validatePayloadShape(documentInput, catalogInput, false);
}

export function validateStudioDocumentPayloadCompleteness(
  documentInput: unknown,
  catalogInput: unknown,
): StudioCatalogDocumentValidationResult {
  return validatePayloadShape(documentInput, catalogInput, true);
}
