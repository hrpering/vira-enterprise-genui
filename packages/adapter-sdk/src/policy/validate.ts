import {
  isSemanticNamespace,
  parseJsonValue,
} from "@vira-enterprise-genui/protocol";
import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import { freezeAdapterData } from "../internal/freeze.js";
import { createExperienceRecipe } from "../recipe/index.js";
import {
  POLICY_ADAPTER_CONTRACT_VERSION,
  POLICY_ADAPTER_MAX_MAPPINGS,
} from "./types.js";
import type {
  PolicyAdapterContractResult,
  PolicyAdapterMapping,
  PolicyAdapterValidationCode,
  ResolvePolicyRefsResult,
} from "./types.js";

const contractFields = new Set(["version", "id", "mappings"]);
const mappingFields = new Set(["recipe", "layoutPolicy", "disclosurePolicy"]);

function failure(code: PolicyAdapterValidationCode, path: string, message: string): PolicyAdapterContractResult {
  return { ok: false, issue: { code, path, message } };
}

function resolveFailure(code: PolicyAdapterValidationCode, path: string, message: string): ResolvePolicyRefsResult {
  return { ok: false, issue: { code, path, message } };
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPolicyReference(value: unknown): value is string {
  return typeof value === "string" && value.includes(".") && isSemanticNamespace(value);
}

function preflightMappings(input: unknown): PolicyAdapterContractResult | undefined {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(input, "mappings");
  if (!descriptor || !("value" in descriptor) || !Array.isArray(descriptor.value)) return undefined;
  if (descriptor.value.length > POLICY_ADAPTER_MAX_MAPPINGS) {
    return failure("MAPPING_LIMIT_EXCEEDED", "$.mappings", `policy adapter may declare at most ${POLICY_ADAPTER_MAX_MAPPINGS} mappings`);
  }
  return undefined;
}

export function createPolicyAdapterContract(input: unknown): PolicyAdapterContractResult {
  const preflight = preflightMappings(input);
  if (preflight) return preflight;
  const parsed = parseJsonValue(input);
  if (!parsed.ok) return failure("INVALID_TYPE", parsed.issue.path, parsed.issue.reason);
  if (!isJsonObject(parsed.value)) return failure("INVALID_TYPE", "$", "policy adapter contract must be a canonical JSON object");
  const fields = parsed.value;

  const unknownField = Object.keys(fields).sort().find((field) => !contractFields.has(field));
  if (unknownField) return failure("UNKNOWN_FIELD", `$.${unknownField}`, `unknown policy adapter field: ${unknownField}`);
  if (fields.version !== POLICY_ADAPTER_CONTRACT_VERSION) return failure("INVALID_VERSION", "$.version", `policy adapter contract version must be ${POLICY_ADAPTER_CONTRACT_VERSION}`);
  if (typeof fields.id !== "string" || !isSemanticNamespace(fields.id)) return failure("INVALID_ID", "$.id", "policy adapter id must be a semantic namespace");
  if (!Array.isArray(fields.mappings) || fields.mappings.length === 0) return failure("INVALID_MAPPINGS", "$.mappings", "mappings must be a non-empty array");
  if (fields.mappings.length > POLICY_ADAPTER_MAX_MAPPINGS) return failure("MAPPING_LIMIT_EXCEEDED", "$.mappings", `policy adapter may declare at most ${POLICY_ADAPTER_MAX_MAPPINGS} mappings`);

  const mappings: PolicyAdapterMapping[] = [];
  const recipes = new Set<string>();
  for (let index = 0; index < fields.mappings.length; index += 1) {
    const raw = fields.mappings[index];
    if (!isJsonObject(raw)) return failure("INVALID_MAPPINGS", `$.mappings[${index}]`, "policy mapping must be a canonical JSON object");
    const unknownMappingField = Object.keys(raw).sort().find((field) => !mappingFields.has(field));
    if (unknownMappingField) return failure("INVALID_MAPPINGS", `$.mappings[${index}].${unknownMappingField}`, `unknown policy mapping field: ${unknownMappingField}`);
    if (typeof raw.recipe !== "string" || !isSemanticNamespace(raw.recipe)) return failure("INVALID_RECIPE_ID", `$.mappings[${index}].recipe`, "recipe must be a semantic namespace");
    if (recipes.has(raw.recipe)) return failure("DUPLICATE_RECIPE", `$.mappings[${index}].recipe`, "duplicate recipe policy mapping");
    if (!isPolicyReference(raw.layoutPolicy)) return failure("INVALID_POLICY_REFERENCE", `$.mappings[${index}].layoutPolicy`, "layoutPolicy must be a namespaced semantic policy reference");
    if (!isPolicyReference(raw.disclosurePolicy)) return failure("INVALID_POLICY_REFERENCE", `$.mappings[${index}].disclosurePolicy`, "disclosurePolicy must be a namespaced semantic policy reference");
    recipes.add(raw.recipe);
    mappings.push({ recipe: raw.recipe, layoutPolicy: raw.layoutPolicy, disclosurePolicy: raw.disclosurePolicy });
  }

  return { ok: true, value: freezeAdapterData({ version: POLICY_ADAPTER_CONTRACT_VERSION, id: fields.id, mappings }) };
}

export function resolvePolicyRefsForRecipe(contractInput: unknown, recipeInput: unknown): ResolvePolicyRefsResult {
  const contract = createPolicyAdapterContract(contractInput);
  if (!contract.ok) return contract;
  const recipe = createExperienceRecipe(recipeInput);
  if (!recipe.ok) return resolveFailure("INVALID_RECIPE", recipe.issue.path, recipe.issue.message);
  const mapping = contract.value.mappings.find((candidate) => candidate.recipe === recipe.value.id);
  if (!mapping) return resolveFailure("UNMAPPED_RECIPE", "$.recipe.id", "no exact composition-policy mapping exists for recipe");
  return { ok: true, value: freezeAdapterData({ layoutPolicy: mapping.layoutPolicy, disclosurePolicy: mapping.disclosurePolicy }) };
}
