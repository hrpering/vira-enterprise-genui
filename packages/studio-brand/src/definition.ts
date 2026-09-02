import {
  createActionAdapterContract,
  createBrandProfile,
  createPolicyAdapterContract,
  type ActionAdapterContract,
  type BrandProfile,
  type PolicyAdapterContract,
} from "@vira-enterprise-genui/adapter-sdk";
import {
  isSemanticNamespace,
  parseJsonValue,
  type JsonObject,
  type JsonValue,
} from "@vira-enterprise-genui/protocol";
import {
  compileDtcgDesignTokens,
  type CompiledStudioDesignSystem,
} from "@vira-enterprise-genui/design-system-compiler";
import {
  createStudioBindingSourceCatalog,
  type StudioBindingSourceCatalog,
} from "@vira-enterprise-genui/studio-binding";
import {
  createStudioComponentCatalog,
  type StudioComponentCatalog,
} from "@vira-enterprise-genui/studio-catalog";
import {
  STUDIO_BRAND_PACKAGE_VERSION,
  type StudioBrandPackage,
  type StudioBrandTemplate,
} from "./types.js";
import { createStudioBrandPackage } from "./validate.js";

export const VIRA_BRAND_DEFINITION_VERSION = "1" as const;
export const VIRA_BRAND_PLATFORM_KEYS = Object.freeze(["web", "ios", "android"] as const);

export type ViraBrandPlatform = (typeof VIRA_BRAND_PLATFORM_KEYS)[number];

export interface ViraBrandComponentImplementationInput {
  readonly component: string;
  readonly web: string;
  readonly ios: string;
  readonly android: string;
}

export interface ViraBrandComponentsInput {
  readonly catalog: StudioComponentCatalog;
  readonly implementations: readonly ViraBrandComponentImplementationInput[];
}

export interface ViraBrandDefinitionInput {
  readonly identity: BrandProfile;
  readonly design: unknown;
  readonly components: ViraBrandComponentsInput;
  readonly actions: ActionAdapterContract;
  readonly dataSources: StudioBindingSourceCatalog;
  readonly policies: PolicyAdapterContract;
  readonly experiences: readonly StudioBrandTemplate[];
}

export interface ViraBrandComponentImplementation {
  readonly component: string;
  readonly web: string;
  readonly ios: string;
  readonly android: string;
}

export interface ViraBrandDefinition {
  readonly version: typeof VIRA_BRAND_DEFINITION_VERSION;
  readonly package: StudioBrandPackage;
  readonly design: CompiledStudioDesignSystem;
  readonly policies: PolicyAdapterContract;
  readonly implementations: readonly ViraBrandComponentImplementation[];
}

export type ViraBrandDefinitionStage =
  | "input"
  | "identity"
  | "design"
  | "components"
  | "actions"
  | "dataSources"
  | "policies"
  | "implementations"
  | "package";

export interface ViraBrandDefinitionIssue {
  readonly stage: ViraBrandDefinitionStage;
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface ViraBrandDefinitionFailure {
  readonly ok: false;
  readonly issue: ViraBrandDefinitionIssue;
}

export type ViraBrandDefinitionResult =
  | { readonly ok: true; readonly value: ViraBrandDefinition }
  | ViraBrandDefinitionFailure;

const TOP_LEVEL_FIELDS = Object.freeze([
  "identity",
  "design",
  "components",
  "actions",
  "dataSources",
  "policies",
  "experiences",
] as const);
const COMPONENT_FIELDS = Object.freeze(["catalog", "implementations"] as const);
const IMPLEMENTATION_FIELDS = Object.freeze(["component", "web", "ios", "android"] as const);

function failure(
  stage: ViraBrandDefinitionStage,
  code: string,
  path: string,
  message: string,
): ViraBrandDefinitionFailure {
  return { ok: false, issue: { stage, code, path, message } };
}

function forwardIssue(
  stage: ViraBrandDefinitionStage,
  issue: { readonly code: string; readonly path: string; readonly message: string },
): ViraBrandDefinitionFailure {
  return failure(stage, issue.code, issue.path, issue.message);
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function propertyPath(base: string, key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    ? `${base}.${key}`
    : `${base}[${JSON.stringify(key)}]`;
}

function requireExactFields(
  value: JsonObject,
  fields: readonly string[],
  stage: ViraBrandDefinitionStage,
  path: string,
): ViraBrandDefinitionFailure | undefined {
  const allowed = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      return failure(stage, "UNKNOWN_FIELD", propertyPath(path, key), `unknown field ${JSON.stringify(key)}`);
    }
  }
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) {
      return failure(stage, "MISSING_FIELD", propertyPath(path, field), `required field ${JSON.stringify(field)} is missing`);
    }
  }
  return undefined;
}

function implementationIdIsSafe(value: string): boolean {
  return value.includes(".") && isSemanticNamespace(value);
}

function normalizeImplementations(
  value: JsonValue,
  catalog: StudioComponentCatalog,
): ViraBrandDefinitionFailure | { readonly ok: true; readonly value: readonly ViraBrandComponentImplementation[] } {
  if (!Array.isArray(value)) {
    return failure("implementations", "INVALID_IMPLEMENTATIONS", "$.components.implementations", "implementations must be an array");
  }

  const catalogRefs = new Set(catalog.components.map((component) => component.ref));
  const byComponent = new Map<string, ViraBrandComponentImplementation>();

  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    const path = `$.components.implementations[${index}]`;
    if (!isJsonObject(entry)) {
      return failure("implementations", "INVALID_IMPLEMENTATION", path, "implementation entry must be an object");
    }
    const fieldIssue = requireExactFields(entry, IMPLEMENTATION_FIELDS, "implementations", path);
    if (fieldIssue) return fieldIssue;

    const component = entry.component;
    if (typeof component !== "string") {
      return failure("implementations", "INVALID_COMPONENT_REFERENCE", `${path}.component`, "component must be a string");
    }
    if (!catalogRefs.has(component)) {
      return failure("implementations", "UNREGISTERED_COMPONENT", `${path}.component`, `component ${JSON.stringify(component)} is not in the active catalog`);
    }
    if (byComponent.has(component)) {
      return failure("implementations", "DUPLICATE_COMPONENT", `${path}.component`, `component ${JSON.stringify(component)} has more than one implementation mapping`);
    }

    const platformValues: Record<ViraBrandPlatform, string> = { web: "", ios: "", android: "" };
    for (const platform of VIRA_BRAND_PLATFORM_KEYS) {
      const implementationId = entry[platform];
      if (typeof implementationId !== "string" || !implementationIdIsSafe(implementationId)) {
        return failure(
          "implementations",
          "INVALID_IMPLEMENTATION_ID",
          `${path}.${platform}`,
          `${platform} implementation must be a namespaced semantic identifier`,
        );
      }
      platformValues[platform] = implementationId;
    }

    byComponent.set(component, Object.freeze({ component, ...platformValues }));
  }

  for (const component of catalog.components) {
    if (!byComponent.has(component.ref)) {
      return failure(
        "implementations",
        "MISSING_COMPONENT",
        "$.components.implementations",
        `component ${JSON.stringify(component.ref)} is missing a platform implementation mapping`,
      );
    }
  }

  if (byComponent.size !== catalog.components.length) {
    return failure(
      "implementations",
      "IMPLEMENTATION_SET_MISMATCH",
      "$.components.implementations",
      "implementation mappings must exactly match the active component catalog",
    );
  }

  return {
    ok: true,
    value: Object.freeze(catalog.components.map((component) => byComponent.get(component.ref)!)),
  };
}

export function defineViraBrand(input: ViraBrandDefinitionInput): ViraBrandDefinitionResult {
  const parsed = parseJsonValue(input);
  if (!parsed.ok) {
    return failure("input", "INVALID_INPUT", parsed.issue.path, parsed.issue.reason);
  }
  if (!isJsonObject(parsed.value)) {
    return failure("input", "INVALID_TYPE", "$", "brand definition must be an object");
  }

  const root = parsed.value;
  const topLevelIssue = requireExactFields(root, TOP_LEVEL_FIELDS, "input", "$" );
  if (topLevelIssue) return topLevelIssue;

  const identity = createBrandProfile(root.identity);
  if (!identity.ok) return forwardIssue("identity", identity.issue);

  const componentsInput = root.components;
  if (!isJsonObject(componentsInput)) {
    return failure("components", "INVALID_TYPE", "$.components", "components must be an object");
  }
  const componentFieldIssue = requireExactFields(componentsInput, COMPONENT_FIELDS, "components", "$.components");
  if (componentFieldIssue) return componentFieldIssue;

  const components = createStudioComponentCatalog(componentsInput.catalog);
  if (!components.ok) return forwardIssue("components", components.issue);

  const implementations = normalizeImplementations(componentsInput.implementations, components.value);
  if (!implementations.ok) return implementations;

  const actions = createActionAdapterContract(root.actions);
  if (!actions.ok) return forwardIssue("actions", actions.issue);

  const dataSources = createStudioBindingSourceCatalog(root.dataSources);
  if (!dataSources.ok) return forwardIssue("dataSources", dataSources.issue);

  const policies = createPolicyAdapterContract(root.policies);
  if (!policies.ok) return forwardIssue("policies", policies.issue);

  const design = compileDtcgDesignTokens(root.design);
  if (!design.ok) return forwardIssue("design", design.issue);

  const brandPackage = createStudioBrandPackage({
    version: STUDIO_BRAND_PACKAGE_VERSION,
    id: identity.value.id,
    brand: identity.value,
    components: components.value,
    dataSources: dataSources.value,
    actions: actions.value,
    templates: root.experiences,
  });
  if (!brandPackage.ok) return forwardIssue("package", brandPackage.issue);

  return {
    ok: true,
    value: Object.freeze({
      version: VIRA_BRAND_DEFINITION_VERSION,
      package: brandPackage.value,
      design: design.value,
      policies: policies.value,
      implementations: implementations.value,
    }),
  };
}
