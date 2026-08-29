import {
  EXPERIENCE_PLAN_MAX_CAPABILITIES,
  isSemanticNamespace,
  isSemanticSegment,
  parseCapability,
  parseIntent,
  parseJsonValue,
} from "@vira-enterprise-genui/protocol";
import type { Capability, JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";
import { freezeAdapterData } from "../internal/freeze.js";
import {
  EXPERIENCE_RECIPE_MAX_REQUIREMENTS,
  EXPERIENCE_RECIPE_VERSION,
} from "./types.js";
import type {
  ExperienceRecipeCapabilityRequirement,
  ExperienceRecipeResult,
  ExperienceRecipeValidationCode,
  RecipeIntentMatchResult,
} from "./types.js";

const rootFields = new Set([
  "version",
  "id",
  "intent",
  "requiredState",
  "capabilityRequirements",
  "availableCapabilities",
  "futureCapabilities",
]);
const intentFields = new Set(["namespace", "name"]);
const requirementFields = new Set(["field", "capability"]);

function failure(code: ExperienceRecipeValidationCode, path: string, message: string): ExperienceRecipeResult {
  return { ok: false, issue: { code, path, message } };
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value);
}

function preflight(input: unknown): ExperienceRecipeResult | undefined {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return undefined;
  for (const [field, max] of [
    ["requiredState", EXPERIENCE_RECIPE_MAX_REQUIREMENTS],
    ["capabilityRequirements", EXPERIENCE_RECIPE_MAX_REQUIREMENTS],
    ["availableCapabilities", EXPERIENCE_PLAN_MAX_CAPABILITIES],
    ["futureCapabilities", EXPERIENCE_PLAN_MAX_CAPABILITIES],
  ] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(input, field);
    if (!descriptor || !("value" in descriptor) || descriptor.value === undefined) continue;
    if (Array.isArray(descriptor.value) && descriptor.value.length > max) {
      return failure(
        field === "requiredState" || field === "capabilityRequirements" ? "REQUIREMENT_LIMIT_EXCEEDED" : "CAPABILITY_LIMIT_EXCEEDED",
        `$.${field}`,
        `${field} exceeds its canonical entry limit`,
      );
    }
  }
  return undefined;
}

function parseCapabilityList(
  value: JsonValue | undefined,
  path: "$.availableCapabilities" | "$.futureCapabilities",
): { readonly ok: true; readonly value: readonly Capability[] } | { readonly ok: false; readonly result: ExperienceRecipeResult } {
  if (value === undefined) return { ok: true, value: [] };
  if (!Array.isArray(value)) return { ok: false, result: failure("INVALID_CAPABILITY", path, "capability bucket must be an array") };
  const output: Capability[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const capability = parseCapability(value[index]);
    if (!capability.ok) return { ok: false, result: failure("INVALID_CAPABILITY", `${path}[${index}]`, capability.issue.message) };
    output.push(capability.value);
  }
  return { ok: true, value: output };
}

export function createExperienceRecipe(input: unknown): ExperienceRecipeResult {
  const preflightResult = preflight(input);
  if (preflightResult) return preflightResult;

  const parsed = parseJsonValue(input);
  if (!parsed.ok) return failure("INVALID_TYPE", parsed.issue.path, parsed.issue.reason);
  if (!isJsonObject(parsed.value)) return failure("INVALID_TYPE", "$", "experience recipe must be a canonical JSON object");
  const fields = parsed.value;

  const unknownField = Object.keys(fields).sort().find((field) => !rootFields.has(field));
  if (unknownField) return failure("UNKNOWN_FIELD", `$.${unknownField}`, `unknown experience recipe field: ${unknownField}`);
  if (fields.version !== EXPERIENCE_RECIPE_VERSION) return failure("INVALID_VERSION", "$.version", `experience recipe version must be ${EXPERIENCE_RECIPE_VERSION}`);
  if (typeof fields.id !== "string" || !isSemanticNamespace(fields.id)) return failure("INVALID_ID", "$.id", "recipe id must be a semantic namespace");

  if (!isJsonObject(fields.intent)) return failure("INVALID_INTENT", "$.intent", "recipe intent must be a canonical JSON object");
  const unknownIntentField = Object.keys(fields.intent).sort().find((field) => !intentFields.has(field));
  if (unknownIntentField) return failure("INVALID_INTENT", `$.intent.${unknownIntentField}`, `unknown recipe intent field: ${unknownIntentField}`);
  if (typeof fields.intent.namespace !== "string" || !isSemanticNamespace(fields.intent.namespace)) {
    return failure("INVALID_INTENT", "$.intent.namespace", "recipe intent namespace must be a semantic namespace");
  }
  if (typeof fields.intent.name !== "string" || !isSemanticSegment(fields.intent.name)) {
    return failure("INVALID_INTENT", "$.intent.name", "recipe intent name must be one semantic segment");
  }

  if (!Array.isArray(fields.requiredState)) return failure("INVALID_REQUIRED_STATE", "$.requiredState", "requiredState must be an array");
  if (fields.requiredState.length > EXPERIENCE_RECIPE_MAX_REQUIREMENTS) {
    return failure("REQUIREMENT_LIMIT_EXCEEDED", "$.requiredState", "requiredState exceeds its canonical entry limit");
  }
  const requiredState: string[] = [];
  const requiredSet = new Set<string>();
  for (let index = 0; index < fields.requiredState.length; index += 1) {
    const field = fields.requiredState[index];
    if (typeof field !== "string" || !isSemanticSegment(field)) {
      return failure("INVALID_REQUIRED_STATE", `$.requiredState[${index}]`, "required state field must be one semantic segment");
    }
    if (requiredSet.has(field)) return failure("DUPLICATE_REQUIRED_STATE", `$.requiredState[${index}]`, "duplicate required state field");
    requiredSet.add(field);
    requiredState.push(field);
  }

  const rawRequirements = fields.capabilityRequirements ?? [];
  if (!Array.isArray(rawRequirements)) return failure("INVALID_CAPABILITY_REQUIREMENT", "$.capabilityRequirements", "capabilityRequirements must be an array");
  if (rawRequirements.length > EXPERIENCE_RECIPE_MAX_REQUIREMENTS) return failure("REQUIREMENT_LIMIT_EXCEEDED", "$.capabilityRequirements", "capabilityRequirements exceeds its canonical entry limit");

  const requirements: ExperienceRecipeCapabilityRequirement[] = [];
  const requirementFieldsSeen = new Set<string>();
  const capabilityIds = new Set<string>();
  for (let index = 0; index < rawRequirements.length; index += 1) {
    const raw = rawRequirements[index];
    if (!isJsonObject(raw)) return failure("INVALID_CAPABILITY_REQUIREMENT", `$.capabilityRequirements[${index}]`, "capability requirement must be a canonical JSON object");
    const unknownRequirementField = Object.keys(raw).sort().find((field) => !requirementFields.has(field));
    if (unknownRequirementField) return failure("INVALID_CAPABILITY_REQUIREMENT", `$.capabilityRequirements[${index}].${unknownRequirementField}`, `unknown capability requirement field: ${unknownRequirementField}`);
    if (typeof raw.field !== "string" || !isSemanticSegment(raw.field)) return failure("INVALID_CAPABILITY_REQUIREMENT", `$.capabilityRequirements[${index}].field`, "requirement field must be one semantic segment");
    if (!requiredSet.has(raw.field)) return failure("UNDECLARED_REQUIREMENT_FIELD", `$.capabilityRequirements[${index}].field`, "capability requirement field must be declared in requiredState");
    if (requirementFieldsSeen.has(raw.field)) return failure("DUPLICATE_REQUIREMENT_FIELD", `$.capabilityRequirements[${index}].field`, "duplicate capability requirement field");
    const capability = parseCapability(raw.capability);
    if (!capability.ok) return failure("INVALID_CAPABILITY", `$.capabilityRequirements[${index}].capability`, capability.issue.message);
    if (capabilityIds.has(capability.value.id)) return failure("DUPLICATE_CAPABILITY", `$.capabilityRequirements[${index}].capability.id`, "duplicate capability identity across recipe positions");
    requirementFieldsSeen.add(raw.field);
    capabilityIds.add(capability.value.id);
    requirements.push({ field: raw.field, capability: capability.value });
  }

  const available = parseCapabilityList(fields.availableCapabilities, "$.availableCapabilities");
  if (!available.ok) return available.result;
  const future = parseCapabilityList(fields.futureCapabilities, "$.futureCapabilities");
  if (!future.ok) return future.result;

  let totalCapabilities = requirements.length;
  for (const [path, list] of [["$.availableCapabilities", available.value], ["$.futureCapabilities", future.value]] as const) {
    totalCapabilities += list.length;
    if (totalCapabilities > EXPERIENCE_PLAN_MAX_CAPABILITIES) return failure("CAPABILITY_LIMIT_EXCEEDED", path, "recipe exceeds ExperiencePlan canonical capability limit");
    for (let index = 0; index < list.length; index += 1) {
      const capability = list[index];
      if (!capability) continue;
      if (capabilityIds.has(capability.id)) return failure("DUPLICATE_CAPABILITY", `${path}[${index}].id`, "duplicate capability identity across recipe positions");
      capabilityIds.add(capability.id);
    }
  }

  return {
    ok: true,
    value: freezeAdapterData({
      version: EXPERIENCE_RECIPE_VERSION,
      id: fields.id,
      intent: { namespace: fields.intent.namespace, name: fields.intent.name },
      requiredState,
      capabilityRequirements: requirements,
      availableCapabilities: [...available.value],
      futureCapabilities: [...future.value],
    }),
  };
}

export function matchRecipeIntent(recipeInput: unknown, intentInput: unknown): RecipeIntentMatchResult {
  const recipe = createExperienceRecipe(recipeInput);
  if (!recipe.ok) return recipe;
  const intent = parseIntent(intentInput);
  if (!intent.ok) return failure("INVALID_INTENT", intent.issue.path, intent.issue.message);
  if (intent.value.namespace !== recipe.value.intent.namespace || intent.value.name !== recipe.value.intent.name) {
    return failure("INTENT_MISMATCH", "$.intent", "canonical intent does not match recipe identity");
  }
  return recipe;
}
