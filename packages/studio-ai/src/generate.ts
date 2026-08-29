import { createActionAdapterContract } from "@vira-enterprise-genui/adapter-sdk";
import { isSemanticNamespace } from "@vira-enterprise-genui/protocol";
import { createStudioBindingSourceCatalog, validateStudioDocumentBindings } from "@vira-enterprise-genui/studio-binding";
import { createStudioComponentCatalog } from "@vira-enterprise-genui/studio-catalog";
import { validateStudioDocumentFlow } from "@vira-enterprise-genui/studio-flow";
import { STUDIO_AI_PROMPT_MAX_LENGTH } from "./types.js";
import type {
  StudioAiDraftResult,
  StudioAiProvider,
  StudioAiRequest,
  StudioAiValidationCode,
} from "./types.js";

const inputFields = new Set(["prompt", "experienceId", "recipeId", "componentCatalog", "bindingSourceCatalog", "actionAdapter", "baseDocument"]);
const forbiddenControlPattern = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function failure(code: StudioAiValidationCode, path: string, message: string): StudioAiDraftResult {
  return { ok: false, issue: { code, path, message } };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function readInput(value: unknown):
  | { readonly ok: true; readonly value: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly result: StudioAiDraftResult } {
  if (!isPlainObject(value) || Object.getOwnPropertySymbols(value).length > 0) {
    return { ok: false, result: failure("INVALID_INPUT", "$", "Studio AI input must be a plain data object") };
  }
  const keys = Object.keys(value);
  if (Object.getOwnPropertyNames(value).length !== keys.length) {
    return { ok: false, result: failure("INVALID_INPUT", "$", "Studio AI input must not contain non-enumerable fields") };
  }
  const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (!inputFields.has(key)) return { ok: false, result: failure("INVALID_INPUT", `$.${key}`, "unknown Studio AI input field") };
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) {
      return { ok: false, result: failure("INVALID_INPUT", `$.${key}`, "Studio AI input must not contain accessor fields") };
    }
    output[key] = descriptor.value;
  }
  return { ok: true, value: output };
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

function nestedPath(base: string, path: string): string {
  return path === "$" ? base : `${base}${path.slice(1)}`;
}

function providerGenerate(provider: StudioAiProvider): StudioAiProvider["generate"] | undefined {
  if (!isPlainObject(provider) || Object.getOwnPropertySymbols(provider).length > 0) return undefined;
  const keys = Object.keys(provider);
  if (Object.getOwnPropertyNames(provider).length !== keys.length || keys.some((key) => key !== "generate")) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(provider, "generate");
  return descriptor && "value" in descriptor && typeof descriptor.value === "function"
    ? descriptor.value as StudioAiProvider["generate"]
    : undefined;
}

export async function generateStudioDraft(input: unknown, provider: StudioAiProvider): Promise<StudioAiDraftResult> {
  const root = readInput(input);
  if (!root.ok) return root.result;
  const fields = root.value;

  if (typeof fields.prompt !== "string"
    || fields.prompt.length < 1
    || fields.prompt.length > STUDIO_AI_PROMPT_MAX_LENGTH
    || fields.prompt.trim().length === 0
    || forbiddenControlPattern.test(fields.prompt)) {
    return failure("INVALID_PROMPT", "$.prompt", `prompt must be non-empty, bounded to ${STUDIO_AI_PROMPT_MAX_LENGTH} characters, and free of unsafe control characters`);
  }
  if (typeof fields.experienceId !== "string" || !isSemanticNamespace(fields.experienceId)) {
    return failure("INVALID_IDENTITY", "$.experienceId", "experienceId must be a semantic namespace");
  }
  if (typeof fields.recipeId !== "string" || !isSemanticNamespace(fields.recipeId)) {
    return failure("INVALID_IDENTITY", "$.recipeId", "recipeId must be a semantic namespace");
  }

  const components = createStudioComponentCatalog(fields.componentCatalog);
  if (!components.ok) return failure("INVALID_COMPONENT_CATALOG", nestedPath("$.componentCatalog", components.issue.path), components.issue.message);
  const bindingSources = createStudioBindingSourceCatalog(fields.bindingSourceCatalog);
  if (!bindingSources.ok) return failure("INVALID_BINDING_SOURCE_CATALOG", nestedPath("$.bindingSourceCatalog", bindingSources.issue.path), bindingSources.issue.message);
  const actions = createActionAdapterContract(fields.actionAdapter);
  if (!actions.ok) return failure("INVALID_ACTION_ADAPTER", nestedPath("$.actionAdapter", actions.issue.path), actions.issue.message);

  let baseDocument;
  if (fields.baseDocument !== undefined) {
    const baseBindings = validateStudioDocumentBindings(fields.baseDocument, components.value, bindingSources.value);
    if (!baseBindings.ok) return failure("INVALID_BASE_DOCUMENT", nestedPath("$.baseDocument", baseBindings.issue.path), baseBindings.issue.message);
    const baseFlow = validateStudioDocumentFlow(baseBindings.value, components.value, actions.value);
    if (!baseFlow.ok) return failure("INVALID_BASE_DOCUMENT", nestedPath("$.baseDocument", baseFlow.issue.path), baseFlow.issue.message);
    if (baseFlow.value.id !== fields.experienceId || baseFlow.value.recipeId !== fields.recipeId) {
      return failure("INVALID_BASE_DOCUMENT", "$.baseDocument", "base document identity must match the requested Studio AI identity");
    }
    baseDocument = baseFlow.value;
  }

  const generate = providerGenerate(provider);
  if (!generate) return failure("INVALID_PROVIDER", "$.provider", "Studio AI provider must be a plain object containing only an own generate function");

  const request: StudioAiRequest = freezeData({
    prompt: fields.prompt,
    identity: { experienceId: fields.experienceId, recipeId: fields.recipeId },
    components: components.value.components,
    bindingSources: bindingSources.value.sources,
    actionEvents: [...new Set(actions.value.mappings.map((mapping) => mapping.event))].sort((left, right) => left.localeCompare(right)),
    ...(baseDocument === undefined ? {} : { baseDocument }),
  });

  let candidate: unknown;
  try {
    candidate = await generate(request);
  } catch {
    return failure("PROVIDER_FAILED", "$.provider", "Studio AI provider failed while generating a draft");
  }

  const candidateBindings = validateStudioDocumentBindings(candidate, components.value, bindingSources.value);
  if (!candidateBindings.ok) return failure("INVALID_CANDIDATE", nestedPath("$.candidate", candidateBindings.issue.path), candidateBindings.issue.message);
  const candidateFlow = validateStudioDocumentFlow(candidateBindings.value, components.value, actions.value);
  if (!candidateFlow.ok) return failure("INVALID_CANDIDATE", nestedPath("$.candidate", candidateFlow.issue.path), candidateFlow.issue.message);
  if (candidateFlow.value.id !== fields.experienceId || candidateFlow.value.recipeId !== fields.recipeId) {
    return failure("IDENTITY_MISMATCH", "$.candidate", "generated Studio document identity does not match the host-requested identity");
  }

  return { ok: true, value: candidateFlow.value };
}
