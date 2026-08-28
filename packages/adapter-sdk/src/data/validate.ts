import {
  isSemanticNamespace,
  isSemanticSegment,
  parseDomainData,
  parseJsonValue,
} from "@vira-enterprise-genui/protocol";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import { freezeAdapterData } from "../internal/freeze.js";
import {
  DATA_ADAPTER_CONTRACT_VERSION,
  DATA_ADAPTER_MAX_BINDINGS,
} from "./types.js";
import type {
  DataAdapterBinding,
  DataAdapterContractResult,
  DataAdapterValidationCode,
  DataProjectionResult,
} from "./types.js";

const contractFields = new Set(["version", "id", "domain", "type", "bindings"]);
const bindingFields = new Set(["from", "to"]);

function failure(code: DataAdapterValidationCode, path: string, message: string): DataAdapterContractResult {
  return { ok: false, issue: { code, path, message } };
}

function projectionFailure(code: DataAdapterValidationCode, path: string, message: string): DataProjectionResult {
  return { ok: false, issue: { code, path, message } };
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function preflightBindings(input: unknown): DataAdapterContractResult | undefined {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(input, "bindings");
  if (!descriptor || !("value" in descriptor) || !Array.isArray(descriptor.value)) return undefined;
  if (descriptor.value.length > DATA_ADAPTER_MAX_BINDINGS) {
    return failure("BINDING_LIMIT_EXCEEDED", "$.bindings", `data adapter may declare at most ${DATA_ADAPTER_MAX_BINDINGS} bindings`);
  }
  return undefined;
}

export function createDataAdapterContract(input: unknown): DataAdapterContractResult {
  const preflight = preflightBindings(input);
  if (preflight) return preflight;

  const parsed = parseJsonValue(input);
  if (!parsed.ok) return failure("INVALID_TYPE", parsed.issue.path, parsed.issue.reason);
  if (!isJsonObject(parsed.value)) return failure("INVALID_TYPE", "$", "data adapter contract must be a canonical JSON object");
  const fields = parsed.value;

  const unknownField = Object.keys(fields).sort().find((field) => !contractFields.has(field));
  if (unknownField) return failure("UNKNOWN_FIELD", `$.${unknownField}`, `unknown data adapter field: ${unknownField}`);
  if (fields.version !== DATA_ADAPTER_CONTRACT_VERSION) return failure("INVALID_VERSION", "$.version", `data adapter contract version must be ${DATA_ADAPTER_CONTRACT_VERSION}`);
  if (typeof fields.id !== "string" || !isSemanticNamespace(fields.id)) return failure("INVALID_ID", "$.id", "data adapter id must be a semantic namespace");
  if (typeof fields.domain !== "string" || !isSemanticNamespace(fields.domain)) return failure("INVALID_DOMAIN", "$.domain", "domain must be a semantic namespace");
  if (typeof fields.type !== "string" || !isSemanticSegment(fields.type)) return failure("INVALID_DATA_TYPE", "$.type", "type must be one semantic segment");
  if (!Array.isArray(fields.bindings) || fields.bindings.length === 0) return failure("INVALID_BINDINGS", "$.bindings", "bindings must be a non-empty array");
  if (fields.bindings.length > DATA_ADAPTER_MAX_BINDINGS) return failure("BINDING_LIMIT_EXCEEDED", "$.bindings", `data adapter may declare at most ${DATA_ADAPTER_MAX_BINDINGS} bindings`);

  const bindings: DataAdapterBinding[] = [];
  const sources = new Set<string>();
  const targets = new Set<string>();
  for (let index = 0; index < fields.bindings.length; index += 1) {
    const raw = fields.bindings[index];
    if (!isJsonObject(raw)) return failure("INVALID_BINDINGS", `$.bindings[${index}]`, "binding must be a canonical JSON object");
    const unknownBindingField = Object.keys(raw).sort().find((field) => !bindingFields.has(field));
    if (unknownBindingField) return failure("INVALID_BINDINGS", `$.bindings[${index}].${unknownBindingField}`, `unknown binding field: ${unknownBindingField}`);
    if (typeof raw.from !== "string" || !isSemanticSegment(raw.from)) return failure("INVALID_BINDINGS", `$.bindings[${index}].from`, "from must be one semantic field segment");
    if (typeof raw.to !== "string" || !isSemanticSegment(raw.to)) return failure("INVALID_BINDINGS", `$.bindings[${index}].to`, "to must be one semantic field segment");
    if (sources.has(raw.from)) return failure("DUPLICATE_SOURCE_FIELD", `$.bindings[${index}].from`, "duplicate source field binding");
    if (targets.has(raw.to)) return failure("DUPLICATE_TARGET_FIELD", `$.bindings[${index}].to`, "duplicate target field binding");
    sources.add(raw.from);
    targets.add(raw.to);
    bindings.push({ from: raw.from, to: raw.to });
  }

  return { ok: true, value: freezeAdapterData({
    version: DATA_ADAPTER_CONTRACT_VERSION,
    id: fields.id,
    domain: fields.domain,
    type: fields.type,
    bindings,
  }) };
}

export function projectDomainData(contractInput: unknown, dataInput: unknown): DataProjectionResult {
  const contract = createDataAdapterContract(contractInput);
  if (!contract.ok) return contract;
  const data = parseDomainData(dataInput);
  if (!data.ok) return projectionFailure("INVALID_DOMAIN_DATA", data.issue.path, data.issue.message);
  if (data.value.domain !== contract.value.domain) return projectionFailure("DOMAIN_MISMATCH", "$.domain", "DomainData domain does not match data adapter contract");
  if (data.value.type !== contract.value.type) return projectionFailure("DATA_TYPE_MISMATCH", "$.type", "DomainData type does not match data adapter contract");
  if (!isJsonObject(data.value.data)) return projectionFailure("NON_OBJECT_DATA", "$.data", "DomainData data must be an object for top-level projection");

  const output = Object.create(null) as Record<string, JsonValue>;
  for (const binding of contract.value.bindings) {
    if (!Object.hasOwn(data.value.data, binding.from)) return projectionFailure("MISSING_SOURCE_FIELD", `$.data.${binding.from}`, "required source field is missing from DomainData");
    const value = data.value.data[binding.from];
    if (value === undefined) return projectionFailure("MISSING_SOURCE_FIELD", `$.data.${binding.from}`, "required source field is missing from DomainData");
    output[binding.to] = value;
  }

  return { ok: true, value: freezeAdapterData(output as JsonObject) };
}
