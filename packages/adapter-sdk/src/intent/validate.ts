import {
  INTENT_PROTOCOL_VERSION,
  isSemanticNamespace,
  isSemanticSegment,
  parseIntent,
  parseJsonValue,
} from "@vira-enterprise-genui/protocol";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import { freezeAdapterData } from "../internal/freeze.js";
import {
  INTENT_ADAPTER_CONTRACT_VERSION,
  INTENT_ADAPTER_MAX_MAPPINGS,
  INTENT_ADAPTER_SOURCE_MAX_LENGTH,
} from "./types.js";
import type {
  AdaptIntentAliasResult,
  IntentAdapterContractResult,
  IntentAdapterMapping,
  IntentAdapterValidationCode,
} from "./types.js";

const contractFields = new Set(["version", "id", "mappings"]);
const mappingFields = new Set(["source", "target"]);
const targetFields = new Set(["namespace", "name"]);
const aliasInputFields = new Set(["source", "confidence", "parameters"]);
const controlCharacterPattern = /[\u0000-\u001F\u007F]/;

function failure(code: IntentAdapterValidationCode, path: string, message: string): IntentAdapterContractResult {
  return { ok: false, issue: { code, path, message } };
}

function adaptFailure(code: IntentAdapterValidationCode, path: string, message: string): AdaptIntentAliasResult {
  return { ok: false, issue: { code, path, message } };
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validSource(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= INTENT_ADAPTER_SOURCE_MAX_LENGTH
    && value.trim() === value
    && !controlCharacterPattern.test(value);
}

function preflightMappings(input: unknown): IntentAdapterContractResult | undefined {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(input, "mappings");
  if (!descriptor || !("value" in descriptor) || !Array.isArray(descriptor.value)) return undefined;
  if (descriptor.value.length > INTENT_ADAPTER_MAX_MAPPINGS) {
    return failure("MAPPING_LIMIT_EXCEEDED", "$.mappings", `intent adapter may declare at most ${INTENT_ADAPTER_MAX_MAPPINGS} mappings`);
  }
  return undefined;
}

export function createIntentAdapterContract(input: unknown): IntentAdapterContractResult {
  const preflight = preflightMappings(input);
  if (preflight) return preflight;

  const parsed = parseJsonValue(input);
  if (!parsed.ok) return failure("INVALID_TYPE", parsed.issue.path, parsed.issue.reason);
  if (!isJsonObject(parsed.value)) return failure("INVALID_TYPE", "$", "intent adapter contract must be a canonical JSON object");
  const fields = parsed.value;

  const unknownField = Object.keys(fields).sort().find((field) => !contractFields.has(field));
  if (unknownField) return failure("UNKNOWN_FIELD", `$.${unknownField}`, `unknown intent adapter field: ${unknownField}`);
  if (fields.version !== INTENT_ADAPTER_CONTRACT_VERSION) {
    return failure("INVALID_VERSION", "$.version", `intent adapter contract version must be ${INTENT_ADAPTER_CONTRACT_VERSION}`);
  }
  if (typeof fields.id !== "string" || !isSemanticNamespace(fields.id)) {
    return failure("INVALID_ID", "$.id", "intent adapter id must be a semantic namespace");
  }
  if (!Array.isArray(fields.mappings) || fields.mappings.length === 0) {
    return failure("INVALID_MAPPINGS", "$.mappings", "mappings must be a non-empty array");
  }
  if (fields.mappings.length > INTENT_ADAPTER_MAX_MAPPINGS) {
    return failure("MAPPING_LIMIT_EXCEEDED", "$.mappings", `intent adapter may declare at most ${INTENT_ADAPTER_MAX_MAPPINGS} mappings`);
  }

  const mappings: IntentAdapterMapping[] = [];
  const sources = new Set<string>();
  for (let index = 0; index < fields.mappings.length; index += 1) {
    const mapping = fields.mappings[index];
    if (!isJsonObject(mapping)) return failure("INVALID_MAPPINGS", `$.mappings[${index}]`, "mapping must be a canonical JSON object");
    const unknownMappingField = Object.keys(mapping).sort().find((field) => !mappingFields.has(field));
    if (unknownMappingField) {
      return failure("INVALID_MAPPINGS", `$.mappings[${index}].${unknownMappingField}`, `unknown mapping field: ${unknownMappingField}`);
    }
    if (!validSource(mapping.source)) {
      return failure("INVALID_SOURCE", `$.mappings[${index}].source`, `source must be a trimmed non-empty string of at most ${INTENT_ADAPTER_SOURCE_MAX_LENGTH} characters`);
    }
    if (sources.has(mapping.source)) {
      return failure("DUPLICATE_SOURCE", `$.mappings[${index}].source`, "duplicate source intent alias");
    }
    if (!isJsonObject(mapping.target)) {
      return failure("INVALID_TARGET", `$.mappings[${index}].target`, "target must be a canonical JSON object");
    }
    const unknownTargetField = Object.keys(mapping.target).sort().find((field) => !targetFields.has(field));
    if (unknownTargetField) {
      return failure("INVALID_TARGET", `$.mappings[${index}].target.${unknownTargetField}`, `unknown target field: ${unknownTargetField}`);
    }
    if (typeof mapping.target.namespace !== "string" || !isSemanticNamespace(mapping.target.namespace)) {
      return failure("INVALID_TARGET", `$.mappings[${index}].target.namespace`, "target namespace must be a semantic namespace");
    }
    if (typeof mapping.target.name !== "string" || !isSemanticSegment(mapping.target.name)) {
      return failure("INVALID_TARGET", `$.mappings[${index}].target.name`, "target name must be one semantic segment");
    }
    sources.add(mapping.source);
    mappings.push({
      source: mapping.source,
      target: { namespace: mapping.target.namespace, name: mapping.target.name },
    });
  }

  return {
    ok: true,
    value: freezeAdapterData({ version: INTENT_ADAPTER_CONTRACT_VERSION, id: fields.id, mappings }),
  };
}

export function adaptIntentAlias(contractInput: unknown, input: unknown): AdaptIntentAliasResult {
  const contract = createIntentAdapterContract(contractInput);
  if (!contract.ok) return contract;

  const parsedInput = parseJsonValue(input);
  if (!parsedInput.ok) return adaptFailure("INVALID_INTENT_INPUT", parsedInput.issue.path, parsedInput.issue.reason);
  if (!isJsonObject(parsedInput.value)) return adaptFailure("INVALID_INTENT_INPUT", "$", "intent alias input must be a canonical JSON object");
  const fields = parsedInput.value;
  const unknownField = Object.keys(fields).sort().find((field) => !aliasInputFields.has(field));
  if (unknownField) return adaptFailure("INVALID_INTENT_INPUT", `$.${unknownField}`, `unknown intent alias input field: ${unknownField}`);
  if (!validSource(fields.source)) {
    return adaptFailure("INVALID_SOURCE", "$.source", `source must be a trimmed non-empty string of at most ${INTENT_ADAPTER_SOURCE_MAX_LENGTH} characters`);
  }

  const mapping = contract.value.mappings.find((candidate) => candidate.source === fields.source);
  if (!mapping) return adaptFailure("UNMAPPED_SOURCE", "$.source", "no exact intent mapping exists for source");

  const intentInput = {
    version: INTENT_PROTOCOL_VERSION,
    namespace: mapping.target.namespace,
    name: mapping.target.name,
    ...(Object.hasOwn(fields, "confidence") ? { confidence: fields.confidence } : {}),
    ...(Object.hasOwn(fields, "parameters") ? { parameters: fields.parameters } : {}),
  };
  const intent = parseIntent(intentInput);
  if (!intent.ok) return adaptFailure("INVALID_INTENT", intent.issue.path, intent.issue.message);
  return { ok: true, value: freezeAdapterData(intent.value) };
}
