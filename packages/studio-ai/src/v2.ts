import type { CompositionPolicyRefs } from "@vira-enterprise-genui/adapter-sdk";
import { isSemanticNamespace } from "@vira-enterprise-genui/protocol";
import {
  createStudioBindingSourceCatalog,
  validateStudioDocumentBindings,
  type StudioBindingSourceDefinition,
} from "@vira-enterprise-genui/studio-binding";
import {
  createStudioComponentCatalog,
  type StudioCatalogComponentDefinition,
  type StudioComponentCatalog,
} from "@vira-enterprise-genui/studio-catalog";
import { validateStudioDocumentFlow } from "@vira-enterprise-genui/studio-flow";
import {
  defineViraBrand,
  type ViraBrandDefinition,
  type ViraBrandDefinitionInput,
  type ViraBrandComponentImplementation,
} from "@vira-enterprise-genui/studio-brand";
import {
  createStudioHostCapabilityManifest,
  STUDIO_HOST_PLATFORMS,
  type StudioHostCapabilityManifest,
  type StudioHostPlatform,
} from "@vira-enterprise-genui/studio-host";
import type { StudioExperienceDocument } from "@vira-enterprise-genui/studio-schema";
import { STUDIO_AI_PROMPT_MAX_LENGTH } from "./types.js";

export const STUDIO_AI_V2_VERSION = "2" as const;
export const STUDIO_AI_V2_MAX_PLATFORMS = 3 as const;

export interface StudioAiV2PlatformSnapshot {
  readonly platform: StudioHostPlatform;
  readonly hostId: string;
  readonly implementationIds: readonly string[];
  readonly capabilityIds: readonly string[];
}
export interface StudioAiV2ActionMapping { readonly event: string; readonly actionType: string; }
export interface StudioAiV2Request {
  readonly version: typeof STUDIO_AI_V2_VERSION;
  readonly prompt: string;
  readonly identity: { readonly experienceId: string; readonly recipeId: string };
  readonly requestedPlatforms: readonly StudioHostPlatform[];
  readonly platforms: readonly StudioAiV2PlatformSnapshot[];
  readonly components: readonly StudioCatalogComponentDefinition[];
  readonly bindingSources: readonly StudioBindingSourceDefinition[];
  readonly actions: readonly StudioAiV2ActionMapping[];
  readonly policy: CompositionPolicyRefs;
  readonly baseDocument?: StudioExperienceDocument;
}
export interface StudioAiV2Provider { readonly generate: (request: StudioAiV2Request) => unknown | Promise<unknown>; }
export type StudioAiV2IssueCode =
  | "INVALID_INPUT" | "INVALID_PROMPT" | "INVALID_IDENTITY" | "INVALID_BRAND" | "INVALID_PLATFORMS"
  | "INVALID_HOST_MANIFEST" | "HOST_PLATFORM_MISMATCH" | "NO_COMMON_COMPONENTS" | "INVALID_POLICY_METADATA"
  | "INVALID_BASE_DOCUMENT" | "INVALID_PROVIDER" | "PROVIDER_FAILED" | "INVALID_CANDIDATE"
  | "UNSUPPORTED_COMPONENT" | "IDENTITY_MISMATCH";
export interface StudioAiV2Issue { readonly code: StudioAiV2IssueCode; readonly path: string; readonly message: string; }
export type StudioAiV2DraftResult = { readonly ok: true; readonly value: StudioExperienceDocument } | { readonly ok: false; readonly issue: StudioAiV2Issue };

const INPUT_FIELDS = new Set(["prompt", "experienceId", "recipeId", "brand", "requestedPlatforms", "hostManifests", "baseDocument"]);
const FORBIDDEN_CONTROL_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function failure(code: StudioAiV2IssueCode, path: string, message: string): StudioAiV2DraftResult { return { ok: false, issue: Object.freeze({ code, path, message }) }; }
function plainDataObject(input: unknown, allowed: ReadonlySet<string>): Readonly<Record<string, unknown>> | undefined {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return undefined;
  try {
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    if (Object.getOwnPropertySymbols(input).length > 0) return undefined;
    const names = Object.getOwnPropertyNames(input);
    const keys = Object.keys(input);
    if (names.length !== keys.length) return undefined;
    const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      if (!allowed.has(key)) return undefined;
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) return undefined;
      output[key] = descriptor.value;
    }
    return output;
  } catch { return undefined; }
}
function denseOwnDataArray(input: unknown, maximum: number): readonly unknown[] | undefined {
  if (!Array.isArray(input) || input.length < 1 || input.length > maximum) return undefined;
  try {
    if (Object.getOwnPropertySymbols(input).length > 0) return undefined;
    const output: unknown[] = [];
    for (let index = 0; index < input.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
      if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) return undefined;
      output.push(descriptor.value);
    }
    const names = Object.getOwnPropertyNames(input);
    if (names.length !== output.length + 1) return undefined;
    for (const name of names) {
      if (name === "length") continue;
      const index = Number(name);
      if (!Number.isInteger(index) || index < 0 || index >= output.length || String(index) !== name) return undefined;
    }
    return output;
  } catch { return undefined; }
}
function freezeData<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) { for (let index = 0; index < value.length; index += 1) freezeData(value[index]); return Object.freeze(value); }
  const object = value as Record<string, unknown>;
  for (const key of Object.keys(object)) freezeData(object[key]);
  return Object.freeze(value);
}
function containsPlatform(values: readonly StudioHostPlatform[], candidate: StudioHostPlatform): boolean {
  for (let index = 0; index < values.length; index += 1) if (values[index] === candidate) return true;
  return false;
}
function containsString(values: readonly string[], candidate: string): boolean {
  for (let index = 0; index < values.length; index += 1) if (values[index] === candidate) return true;
  return false;
}
function providerGenerate(provider: StudioAiV2Provider): StudioAiV2Provider["generate"] | undefined {
  const data = plainDataObject(provider, new Set(["generate"]));
  return data && typeof data.generate === "function" ? data.generate as StudioAiV2Provider["generate"] : undefined;
}
function requestedPlatforms(input: unknown): readonly StudioHostPlatform[] | undefined {
  const values = denseOwnDataArray(input, STUDIO_AI_V2_MAX_PLATFORMS);
  if (!values) return undefined;
  const output: StudioHostPlatform[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (typeof value !== "string" || !STUDIO_HOST_PLATFORMS.includes(value as StudioHostPlatform) || containsPlatform(output, value as StudioHostPlatform)) return undefined;
    output.push(value as StudioHostPlatform);
  }
  return Object.freeze(output);
}
function manifestsByPlatform(raw: unknown, requested: readonly StudioHostPlatform[]): { readonly ok: true; readonly value: ReadonlyMap<StudioHostPlatform, StudioHostCapabilityManifest> } | { readonly ok: false; readonly result: StudioAiV2DraftResult } {
  const values = denseOwnDataArray(raw, STUDIO_AI_V2_MAX_PLATFORMS);
  if (!values || values.length !== requested.length) return { ok: false, result: failure("INVALID_HOST_MANIFEST", "$.hostManifests", "exactly one Host Capability Manifest is required for every requested platform") };
  const result = new Map<StudioHostPlatform, StudioHostCapabilityManifest>();
  for (let index = 0; index < values.length; index += 1) {
    const parsed = createStudioHostCapabilityManifest(values[index]);
    if (!parsed.ok) return { ok: false, result: failure("INVALID_HOST_MANIFEST", `$.hostManifests[${index}]`, parsed.issue.message) };
    if (!containsPlatform(requested, parsed.value.platform)) return { ok: false, result: failure("HOST_PLATFORM_MISMATCH", `$.hostManifests[${index}].platform`, "Host manifest platform was not requested") };
    if (result.has(parsed.value.platform)) return { ok: false, result: failure("INVALID_HOST_MANIFEST", `$.hostManifests[${index}].platform`, "duplicate Host manifest platform") };
    result.set(parsed.value.platform, parsed.value);
  }
  for (let index = 0; index < requested.length; index += 1) if (!result.has(requested[index]!)) return { ok: false, result: failure("INVALID_HOST_MANIFEST", "$.hostManifests", `missing Host manifest for ${requested[index]}`) };
  return { ok: true, value: result };
}
function implementationFor(brand: ViraBrandDefinition, component: string): ViraBrandComponentImplementation | undefined {
  for (let index = 0; index < brand.implementations.length; index += 1) {
    const mapping = brand.implementations[index];
    if (mapping?.component === component) return mapping;
  }
  return undefined;
}
function commonCatalog(brand: ViraBrandDefinition, requested: readonly StudioHostPlatform[], hosts: ReadonlyMap<StudioHostPlatform, StudioHostCapabilityManifest>): StudioComponentCatalog | undefined {
  const components: StudioCatalogComponentDefinition[] = [];
  for (let componentIndex = 0; componentIndex < brand.package.components.components.length; componentIndex += 1) {
    const component = brand.package.components.components[componentIndex];
    if (!component) continue;
    const mapping = implementationFor(brand, component.ref);
    if (!mapping) continue;
    let supported = true;
    for (let platformIndex = 0; platformIndex < requested.length; platformIndex += 1) {
      const platform = requested[platformIndex]!;
      const host = hosts.get(platform);
      const implementationId = mapping[platform];
      if (!host || typeof implementationId !== "string" || !containsString(host.implementationIds, implementationId)) { supported = false; break; }
    }
    if (supported) components.push(component);
  }
  if (components.length === 0) return undefined;
  const parsed = createStudioComponentCatalog({ version: brand.package.components.version, id: brand.package.components.id, brandId: brand.package.components.brandId, components });
  return parsed.ok ? parsed.value : undefined;
}
function uniqueSorted(values: readonly string[]): readonly string[] {
  const output: string[] = [];
  for (let index = 0; index < values.length; index += 1) if (!containsString(output, values[index]!)) output.push(values[index]!);
  output.sort();
  return Object.freeze(output);
}
function platformSnapshots(brand: ViraBrandDefinition, catalog: StudioComponentCatalog, requested: readonly StudioHostPlatform[], hosts: ReadonlyMap<StudioHostPlatform, StudioHostCapabilityManifest>): readonly StudioAiV2PlatformSnapshot[] {
  const snapshots: StudioAiV2PlatformSnapshot[] = [];
  for (let platformIndex = 0; platformIndex < requested.length; platformIndex += 1) {
    const platform = requested[platformIndex]!;
    const host = hosts.get(platform)!;
    const implementationIds: string[] = [];
    for (let componentIndex = 0; componentIndex < catalog.components.length; componentIndex += 1) {
      const component = catalog.components[componentIndex];
      if (!component) continue;
      const mapping = implementationFor(brand, component.ref);
      const implementationId = mapping?.[platform];
      if (typeof implementationId === "string") implementationIds.push(implementationId);
    }
    const capabilityIds: string[] = [];
    for (let capabilityIndex = 0; capabilityIndex < host.capabilities.length; capabilityIndex += 1) {
      const capability = host.capabilities[capabilityIndex];
      if (capability) capabilityIds.push(`${capability.id}@${capability.version}`);
    }
    snapshots.push(Object.freeze({ platform, hostId: host.id, implementationIds: uniqueSorted(implementationIds), capabilityIds: uniqueSorted(capabilityIds) }));
  }
  return Object.freeze(snapshots);
}
function policyRefsForRecipe(brand: ViraBrandDefinition, recipeId: string): CompositionPolicyRefs | undefined {
  for (let index = 0; index < brand.policies.mappings.length; index += 1) {
    const mapping = brand.policies.mappings[index];
    if (mapping?.recipe === recipeId) return Object.freeze({ layoutPolicy: mapping.layoutPolicy, disclosurePolicy: mapping.disclosurePolicy });
  }
  return undefined;
}
function actionMappings(brand: ViraBrandDefinition): readonly StudioAiV2ActionMapping[] {
  const result: StudioAiV2ActionMapping[] = [];
  for (let index = 0; index < brand.package.actions.mappings.length; index += 1) {
    const mapping = brand.package.actions.mappings[index];
    if (mapping) result.push(Object.freeze({ event: mapping.event, actionType: mapping.actionType }));
  }
  result.sort((left, right) => left.event === right.event ? left.actionType.localeCompare(right.actionType) : left.event.localeCompare(right.event));
  return Object.freeze(result);
}
function unsupportedComponent(document: StudioExperienceDocument, allowed: ReadonlySet<string>): string | undefined {
  for (let viewIndex = 0; viewIndex < document.views.length; viewIndex += 1) {
    const view = document.views[viewIndex];
    if (!view) continue;
    for (let nodeIndex = 0; nodeIndex < view.nodes.length; nodeIndex += 1) {
      const node = view.nodes[nodeIndex];
      if (node && !allowed.has(node.component)) return node.component;
    }
  }
  return undefined;
}

export async function generateStudioDraftV2(input: unknown, provider: StudioAiV2Provider): Promise<StudioAiV2DraftResult> {
  const fields = plainDataObject(input, INPUT_FIELDS);
  if (!fields) return failure("INVALID_INPUT", "$", "Studio AI v2 input must be an exact plain data object");
  if (typeof fields.prompt !== "string" || fields.prompt.length < 1 || fields.prompt.length > STUDIO_AI_PROMPT_MAX_LENGTH || fields.prompt.trim().length === 0 || FORBIDDEN_CONTROL_PATTERN.test(fields.prompt)) return failure("INVALID_PROMPT", "$.prompt", "Studio AI v2 prompt is invalid");
  if (typeof fields.experienceId !== "string" || !isSemanticNamespace(fields.experienceId) || typeof fields.recipeId !== "string" || !isSemanticNamespace(fields.recipeId)) return failure("INVALID_IDENTITY", "$", "Studio AI v2 identity must use semantic namespaces");
  const brand = defineViraBrand(fields.brand as ViraBrandDefinitionInput);
  if (!brand.ok) return failure("INVALID_BRAND", `$.brand${brand.issue.path === "$" ? "" : brand.issue.path.slice(1)}`, brand.issue.message);
  const platforms = requestedPlatforms(fields.requestedPlatforms);
  if (!platforms) return failure("INVALID_PLATFORMS", "$.requestedPlatforms", "requestedPlatforms must contain 1..3 unique web/ios/android targets");
  const hosts = manifestsByPlatform(fields.hostManifests, platforms);
  if (!hosts.ok) return hosts.result;
  const catalog = commonCatalog(brand.value, platforms, hosts.value);
  if (!catalog) return failure("NO_COMMON_COMPONENTS", "$.requestedPlatforms", "requested platforms do not share any Brand component supported by every Host");
  const bindings = createStudioBindingSourceCatalog(brand.value.package.dataSources);
  if (!bindings.ok) return failure("INVALID_BRAND", "$.brand.dataSources", bindings.issue.message);
  const policy = policyRefsForRecipe(brand.value, fields.recipeId);
  if (!policy) return failure("INVALID_POLICY_METADATA", "$.brand.policies", "no exact composition-policy mapping exists for requested recipeId");

  let baseDocument: StudioExperienceDocument | undefined;
  if (fields.baseDocument !== undefined) {
    const baseBindings = validateStudioDocumentBindings(fields.baseDocument, catalog, bindings.value);
    if (!baseBindings.ok) return failure("INVALID_BASE_DOCUMENT", `$.baseDocument${baseBindings.issue.path === "$" ? "" : baseBindings.issue.path.slice(1)}`, baseBindings.issue.message);
    const baseFlow = validateStudioDocumentFlow(baseBindings.value, catalog, brand.value.package.actions);
    if (!baseFlow.ok) return failure("INVALID_BASE_DOCUMENT", `$.baseDocument${baseFlow.issue.path === "$" ? "" : baseFlow.issue.path.slice(1)}`, baseFlow.issue.message);
    if (baseFlow.value.id !== fields.experienceId || baseFlow.value.recipeId !== fields.recipeId) return failure("INVALID_BASE_DOCUMENT", "$.baseDocument", "base document identity does not match requested identity");
    baseDocument = baseFlow.value;
  }

  const generate = providerGenerate(provider);
  if (!generate) return failure("INVALID_PROVIDER", "$.provider", "Studio AI v2 provider must be an exact own-data object with generate only");
  const request: StudioAiV2Request = freezeData({
    version: STUDIO_AI_V2_VERSION,
    prompt: fields.prompt,
    identity: Object.freeze({ experienceId: fields.experienceId, recipeId: fields.recipeId }),
    requestedPlatforms: platforms,
    platforms: platformSnapshots(brand.value, catalog, platforms, hosts.value),
    components: catalog.components,
    bindingSources: bindings.value.sources,
    actions: actionMappings(brand.value),
    policy,
    ...(baseDocument === undefined ? {} : { baseDocument }),
  });
  let candidate: unknown;
  try { candidate = await generate(request); }
  catch { return failure("PROVIDER_FAILED", "$.provider", "Studio AI v2 provider failed while generating a draft"); }

  const candidateBindings = validateStudioDocumentBindings(candidate, catalog, bindings.value);
  if (!candidateBindings.ok) {
    const allBindings = validateStudioDocumentBindings(candidate, brand.value.package.components, bindings.value);
    if (allBindings.ok) {
      const allowed = new Set<string>();
      for (let index = 0; index < catalog.components.length; index += 1) if (catalog.components[index]) allowed.add(catalog.components[index]!.ref);
      const unsupported = unsupportedComponent(allBindings.value, allowed);
      if (unsupported) return failure("UNSUPPORTED_COMPONENT", "$.candidate", `generated component ${unsupported} is not supported by every requested platform Host`);
    }
    return failure("INVALID_CANDIDATE", `$.candidate${candidateBindings.issue.path === "$" ? "" : candidateBindings.issue.path.slice(1)}`, candidateBindings.issue.message);
  }
  const candidateFlow = validateStudioDocumentFlow(candidateBindings.value, catalog, brand.value.package.actions);
  if (!candidateFlow.ok) return failure("INVALID_CANDIDATE", `$.candidate${candidateFlow.issue.path === "$" ? "" : candidateFlow.issue.path.slice(1)}`, candidateFlow.issue.message);
  if (candidateFlow.value.id !== fields.experienceId || candidateFlow.value.recipeId !== fields.recipeId) return failure("IDENTITY_MISMATCH", "$.candidate", "generated document identity does not match host-requested identity");
  return { ok: true, value: candidateFlow.value };
}
