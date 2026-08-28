import {
  isSemanticNamespace,
  parseCapability,
  parseJsonValue,
} from "@vira-enterprise-genui/protocol";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import { freezeAdapterData } from "../internal/freeze.js";
import {
  COMPONENT_ADAPTER_CONTRACT_VERSION,
  COMPONENT_ADAPTER_MAX_MAPPINGS,
} from "./types.js";
import type {
  ComponentAdapterContractResult,
  ComponentAdapterMapping,
  ComponentAdapterValidationCode,
  ResolveComponentResult,
} from "./types.js";

const contractFields = new Set(["version", "id", "mappings"]);
const mappingFields = new Set(["capability", "component"]);

function failure(code: ComponentAdapterValidationCode, path: string, message: string): ComponentAdapterContractResult {
  return { ok: false, issue: { code, path, message } };
}

function resolveFailure(code: ComponentAdapterValidationCode, path: string, message: string): ResolveComponentResult {
  return { ok: false, issue: { code, path, message } };
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isComponentReference(value: unknown): value is string {
  return typeof value === "string" && value.includes(".") && isSemanticNamespace(value);
}

function preflightMappings(input: unknown): ComponentAdapterContractResult | undefined {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(input, "mappings");
  if (!descriptor || !("value" in descriptor) || !Array.isArray(descriptor.value)) return undefined;
  if (descriptor.value.length > COMPONENT_ADAPTER_MAX_MAPPINGS) {
    return failure("MAPPING_LIMIT_EXCEEDED", "$.mappings", `component adapter may declare at most ${COMPONENT_ADAPTER_MAX_MAPPINGS} mappings`);
  }
  return undefined;
}

export function createComponentAdapterContract(input: unknown): ComponentAdapterContractResult {
  const preflight = preflightMappings(input);
  if (preflight) return preflight;

  const parsed = parseJsonValue(input);
  if (!parsed.ok) return failure("INVALID_TYPE", parsed.issue.path, parsed.issue.reason);
  if (!isJsonObject(parsed.value)) return failure("INVALID_TYPE", "$", "component adapter contract must be a canonical JSON object");
  const fields = parsed.value;

  const unknownField = Object.keys(fields).sort().find((field) => !contractFields.has(field));
  if (unknownField) return failure("UNKNOWN_FIELD", `$.${unknownField}`, `unknown component adapter field: ${unknownField}`);
  if (fields.version !== COMPONENT_ADAPTER_CONTRACT_VERSION) {
    return failure("INVALID_VERSION", "$.version", `component adapter contract version must be ${COMPONENT_ADAPTER_CONTRACT_VERSION}`);
  }
  if (typeof fields.id !== "string" || !isSemanticNamespace(fields.id)) {
    return failure("INVALID_ID", "$.id", "component adapter id must be a semantic namespace");
  }
  if (!Array.isArray(fields.mappings) || fields.mappings.length === 0) {
    return failure("INVALID_MAPPINGS", "$.mappings", "mappings must be a non-empty array");
  }
  if (fields.mappings.length > COMPONENT_ADAPTER_MAX_MAPPINGS) {
    return failure("MAPPING_LIMIT_EXCEEDED", "$.mappings", `component adapter may declare at most ${COMPONENT_ADAPTER_MAX_MAPPINGS} mappings`);
  }

  const mappings: ComponentAdapterMapping[] = [];
  const capabilities = new Set<string>();
  for (let index = 0; index < fields.mappings.length; index += 1) {
    const raw = fields.mappings[index];
    if (!isJsonObject(raw)) return failure("INVALID_MAPPINGS", `$.mappings[${index}]`, "component mapping must be a canonical JSON object");
    const unknownMappingField = Object.keys(raw).sort().find((field) => !mappingFields.has(field));
    if (unknownMappingField) return failure("INVALID_MAPPINGS", `$.mappings[${index}].${unknownMappingField}`, `unknown component mapping field: ${unknownMappingField}`);

    const capability = parseCapability(raw.capability);
    if (!capability.ok) return failure("INVALID_CAPABILITY", `$.mappings[${index}].capability`, capability.issue.message);
    if (capabilities.has(capability.value.id)) return failure("DUPLICATE_CAPABILITY", `$.mappings[${index}].capability.id`, "duplicate capability mapping");
    if (!isComponentReference(raw.component)) {
      return failure("INVALID_COMPONENT_REFERENCE", `$.mappings[${index}].component`, "component must be a namespaced semantic reference, not an implementation/import value");
    }

    capabilities.add(capability.value.id);
    mappings.push({ capability: capability.value, component: raw.component });
  }

  return {
    ok: true,
    value: freezeAdapterData({ version: COMPONENT_ADAPTER_CONTRACT_VERSION, id: fields.id, mappings }),
  };
}

export function resolveComponentForCapability(contractInput: unknown, capabilityInput: unknown): ResolveComponentResult {
  const contract = createComponentAdapterContract(contractInput);
  if (!contract.ok) return contract;
  const capability = parseCapability(capabilityInput);
  if (!capability.ok) return resolveFailure("INVALID_CAPABILITY", "$.capability", capability.issue.message);
  const mapping = contract.value.mappings.find((candidate) => candidate.capability.id === capability.value.id);
  if (!mapping) return resolveFailure("UNMAPPED_CAPABILITY", "$.capability.id", "no exact component mapping exists for capability");
  return { ok: true, value: mapping.component };
}
