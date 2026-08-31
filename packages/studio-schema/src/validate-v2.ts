import { isSemanticNamespace, isSemanticSegment, parseJsonValue } from "@vira-enterprise-genui/protocol";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import { parseStudioExperienceDocument as parseLegacyStudioExperienceDocument } from "./validate.js";
import { STUDIO_MAX_ACTION_PAYLOAD_BINDINGS } from "./types.js";
import type {
  StudioBindingSource,
  StudioExperienceDocumentResult,
  StudioInteractionPayloadBinding,
  StudioInteractionPayloadSource,
  StudioRepeat,
  StudioValidationCode,
} from "./types.js";

type MutableJsonObject = { [key: string]: JsonValue };

function failure(
  code: StudioValidationCode,
  path: string,
  message: string,
): StudioExperienceDocumentResult {
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

function exact(value: JsonObject, allowed: readonly string[]): string | undefined {
  const set = new Set(allowed);
  return Object.keys(value).sort().find((key) => !set.has(key));
}

function validScopePath(value: unknown): value is string {
  return typeof value === "string"
    && value.startsWith("currentItem.")
    && isSemanticNamespace(value);
}

function validPath(value: unknown): value is string {
  return typeof value === "string" && isSemanticNamespace(value);
}

function parseSource(
  value: JsonValue | undefined,
  path: string,
  allowLiteral: boolean,
):
  | { readonly ok: true; readonly source: StudioInteractionPayloadSource }
  | { readonly ok: false; readonly result: StudioExperienceDocumentResult } {
  if (!isObject(value) || typeof value.kind !== "string") {
    return {
      ok: false,
      result: failure("INVALID_ACTION_PAYLOAD", path, "payload source must be an object with a kind"),
    };
  }

  if (value.kind === "literal") {
    if (!allowLiteral) {
      return {
        ok: false,
        result: failure("INVALID_ACTION_PAYLOAD", `${path}.kind`, "literal source is not allowed here"),
      };
    }
    const unknown = exact(value, ["kind", "value"]);
    if (unknown) {
      return {
        ok: false,
        result: failure("UNKNOWN_FIELD", `${path}.${unknown}`, `unknown payload source field: ${unknown}`),
      };
    }
    if (!Object.hasOwn(value, "value")) {
      return {
        ok: false,
        result: failure("INVALID_ACTION_PAYLOAD", `${path}.value`, "literal payload source requires value"),
      };
    }
    return { ok: true, source: { kind: "literal", value: value.value as JsonValue } };
  }

  if (value.kind !== "state" && value.kind !== "domain" && value.kind !== "scope") {
    return {
      ok: false,
      result: failure(
        "INVALID_ACTION_PAYLOAD",
        `${path}.kind`,
        "source kind must be state, domain, scope, or literal",
      ),
    };
  }

  const unknown = exact(value, ["kind", "path"]);
  if (unknown) {
    return {
      ok: false,
      result: failure("UNKNOWN_FIELD", `${path}.${unknown}`, `unknown source field: ${unknown}`),
    };
  }
  const valid = value.kind === "scope" ? validScopePath(value.path) : validPath(value.path);
  if (!valid) {
    return {
      ok: false,
      result: failure(
        "INVALID_ACTION_PAYLOAD",
        `${path}.path`,
        value.kind === "scope"
          ? "scope path must start with currentItem and be semantic"
          : "source path must be semantic",
      ),
    };
  }
  return { ok: true, source: { kind: value.kind, path: value.path as string } };
}

export function parseStudioExperienceDocument(input: unknown): StudioExperienceDocumentResult {
  const parsed = parseJsonValue(input);
  if (!parsed.ok) return failure("INVALID_TYPE", parsed.issue.path, parsed.issue.reason);
  if (!isObject(parsed.value)) return parseLegacyStudioExperienceDocument(parsed.value);

  // parseJsonValue returns deeply readonly canonical JSON. We clone before
  // temporarily removing v2-only fields for the v1 structural parser.
  const sanitized = structuredClone(parsed.value) as MutableJsonObject;
  const views = sanitized.views;
  if (!Array.isArray(views)) return parseLegacyStudioExperienceDocument(sanitized);

  const repeats = new Map<string, StudioRepeat>();
  for (let viewIndex = 0; viewIndex < views.length; viewIndex += 1) {
    const view = mutableObject(views[viewIndex]);
    const nodes = view?.nodes;
    if (!view || !Array.isArray(nodes)) continue;

    for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
      const node = mutableObject(nodes[nodeIndex]);
      if (!node || !Object.hasOwn(node, "repeat")) continue;
      const path = `$.views[${viewIndex}].nodes[${nodeIndex}].repeat`;
      const repeat = mutableObject(node.repeat);
      if (!repeat) return failure("INVALID_REPEAT", path, "repeat must be an object");
      const unknown = exact(repeat, ["source"]);
      if (unknown) return failure("UNKNOWN_FIELD", `${path}.${unknown}`, `unknown repeat field: ${unknown}`);

      const source = mutableObject(repeat.source);
      if (!source) return failure("INVALID_REPEAT", `${path}.source`, "repeat source must be an object");
      const unknownSource = exact(source, ["kind", "path"]);
      if (unknownSource) {
        return failure(
          "UNKNOWN_FIELD",
          `${path}.source.${unknownSource}`,
          `unknown repeat source field: ${unknownSource}`,
        );
      }
      if (source.kind !== "state" && source.kind !== "domain") {
        return failure("INVALID_REPEAT", `${path}.source.kind`, "repeat source kind must be state or domain");
      }
      if (!validPath(source.path)) {
        return failure("INVALID_REPEAT", `${path}.source.path`, "repeat source path must be semantic");
      }

      repeats.set(`${viewIndex}:${nodeIndex}`, {
        source: { kind: source.kind, path: source.path },
      });
      delete node.repeat;
    }
  }

  const bindingSources: StudioBindingSource[] = [];
  const bindings = sanitized.bindings;
  if (Array.isArray(bindings)) {
    for (let index = 0; index < bindings.length; index += 1) {
      const binding = mutableObject(bindings[index]);
      const source = mutableObject(binding?.source);
      if (!binding || !source) continue;

      if (source.kind === "scope") {
        if (!validScopePath(source.path)) {
          return failure(
            "INVALID_BINDING",
            `$.bindings[${index}].source.path`,
            "scope binding path must start with currentItem and be semantic",
          );
        }
        bindingSources[index] = { kind: "scope", path: source.path };
        binding.source = { kind: "domain", path: source.path };
      } else if ((source.kind === "state" || source.kind === "domain") && validPath(source.path)) {
        bindingSources[index] = { kind: source.kind, path: source.path };
      }
    }
  }

  const payloads = new Map<number, readonly StudioInteractionPayloadBinding[]>();
  const interactions = sanitized.interactions;
  if (Array.isArray(interactions)) {
    for (let interactionIndex = 0; interactionIndex < interactions.length; interactionIndex += 1) {
      const interaction = mutableObject(interactions[interactionIndex]);
      if (!interaction || !Object.hasOwn(interaction, "payloadBindings")) continue;
      const path = `$.interactions[${interactionIndex}].payloadBindings`;
      const rawPayloads = interaction.payloadBindings;
      if (!Array.isArray(rawPayloads)) {
        return failure("INVALID_ACTION_PAYLOAD", path, "payloadBindings must be an array");
      }
      if (rawPayloads.length > STUDIO_MAX_ACTION_PAYLOAD_BINDINGS) {
        return failure(
          "INVALID_ACTION_PAYLOAD",
          path,
          `payloadBindings allows at most ${STUDIO_MAX_ACTION_PAYLOAD_BINDINGS} entries`,
        );
      }

      const keys = new Set<string>();
      const normalized: StudioInteractionPayloadBinding[] = [];
      for (let payloadIndex = 0; payloadIndex < rawPayloads.length; payloadIndex += 1) {
        const value = mutableObject(rawPayloads[payloadIndex]);
        const base = `${path}[${payloadIndex}]`;
        if (!value) return failure("INVALID_ACTION_PAYLOAD", base, "payload binding must be an object");
        const unknown = exact(value, ["key", "source"]);
        if (unknown) return failure("UNKNOWN_FIELD", `${base}.${unknown}`, `unknown payload binding field: ${unknown}`);
        if (typeof value.key !== "string" || !isSemanticSegment(value.key)) {
          return failure("INVALID_ACTION_PAYLOAD", `${base}.key`, "payload key must be one semantic segment");
        }
        if (keys.has(value.key)) {
          return failure("INVALID_ACTION_PAYLOAD", `${base}.key`, "duplicate payload key");
        }
        const source = parseSource(value.source, `${base}.source`, true);
        if (!source.ok) return source.result;
        keys.add(value.key);
        normalized.push({ key: value.key, source: source.source });
      }
      payloads.set(interactionIndex, normalized);
      delete interaction.payloadBindings;
    }
  }

  const legacy = parseLegacyStudioExperienceDocument(sanitized);
  if (!legacy.ok) return legacy;

  const normalizedViews = legacy.value.views.map((view, viewIndex) => ({
    ...view,
    nodes: view.nodes.map((node, nodeIndex) => {
      const repeat = repeats.get(`${viewIndex}:${nodeIndex}`);
      return repeat ? { ...node, repeat } : node;
    }),
  }));
  const normalizedBindings = legacy.value.bindings.map((binding, index) => (
    bindingSources[index]
      ? { ...binding, source: bindingSources[index] as StudioBindingSource }
      : binding
  ));
  const normalizedInteractions = legacy.value.interactions.map((interaction, index) => {
    const payloadBindings = payloads.get(index);
    return payloadBindings === undefined
      ? interaction
      : { ...interaction, payloadBindings };
  });

  return {
    ok: true,
    value: freeze({
      ...legacy.value,
      views: normalizedViews,
      bindings: normalizedBindings,
      interactions: normalizedInteractions,
    }),
  };
}
