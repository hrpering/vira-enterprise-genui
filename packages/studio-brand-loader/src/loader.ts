import { isSemanticNamespace } from "@vira-enterprise-genui/protocol";
import { createStudioBrandPackage } from "@vira-enterprise-genui/studio-brand";
import { parseStudioExperienceDocument } from "@vira-enterprise-genui/studio-schema";
import type {
  ActiveStudioBrandResult,
  StudioBrandLoaderIssue,
  StudioBrandLoaderValidationCode,
  StudioTrustedRendererRegistry,
} from "./types.js";

function issue(
  code: StudioBrandLoaderValidationCode,
  path: string,
  message: string,
): StudioBrandLoaderIssue {
  return Object.freeze({ code, path, message });
}

function readRegistry<T extends StudioTrustedRendererRegistry>(
  input: T,
  expectedRefs: ReadonlySet<string>,
  path: string,
): { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issue: StudioBrandLoaderIssue } {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, issue: issue("INVALID_RENDERER_REGISTRY", path, "renderer registry must be a plain object") };
  }
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    return { ok: false, issue: issue("INVALID_RENDERER_REGISTRY", path, "renderer registry must be a plain object") };
  }
  if (Object.getOwnPropertySymbols(input).length > 0 || Object.getOwnPropertyNames(input).length !== Object.keys(input).length) {
    return { ok: false, issue: issue("INVALID_RENDERER_REGISTRY", path, "renderer registry must contain enumerable string data properties only") };
  }

  const actual = Object.keys(input);
  const extra = actual.sort().find((ref) => !expectedRefs.has(ref));
  if (extra) {
    return { ok: false, issue: issue("EXTRA_RENDERER", `${path}.${extra}`, "renderer is not declared by the active brand component catalog") };
  }

  for (const ref of expectedRefs) {
    const descriptor = Object.getOwnPropertyDescriptor(input, ref);
    if (!descriptor || !("value" in descriptor)) {
      return { ok: false, issue: issue("MISSING_RENDERER", `${path}.${ref}`, "brand component is missing a trusted renderer") };
    }
    if (typeof descriptor.value !== "function") {
      return { ok: false, issue: issue("INVALID_RENDERER", `${path}.${ref}`, "trusted renderer must be a function") };
    }
  }

  return { ok: true, value: Object.freeze(input) };
}

export function createActiveStudioBrand<
  TAuthoring extends StudioTrustedRendererRegistry,
  TRuntime extends StudioTrustedRendererRegistry,
>(input: {
  readonly brandPackage: unknown;
  readonly authoringRenderers: TAuthoring;
  readonly runtimeRenderers: TRuntime;
}): ActiveStudioBrandResult<TAuthoring, TRuntime> {
  const brand = createStudioBrandPackage(input.brandPackage);
  if (!brand.ok) {
    return {
      ok: false,
      issue: issue(
        "INVALID_BRAND_PACKAGE",
        `$.brandPackage${brand.issue.path === "$" ? "" : brand.issue.path.slice(1)}`,
        brand.issue.message,
      ),
    };
  }

  const expectedRefs = new Set(brand.value.components.components.map((component) => component.ref));
  const authoring = readRegistry(input.authoringRenderers, expectedRefs, "$.authoringRenderers");
  if (!authoring.ok) return authoring;
  const runtime = readRegistry(input.runtimeRenderers, expectedRefs, "$.runtimeRenderers");
  if (!runtime.ok) return runtime;

  const templateIds = Object.freeze(brand.value.templates.map((template) => template.id));
  const active = Object.freeze({
    package: brand.value,
    authoringRenderers: authoring.value,
    runtimeRenderers: runtime.value,
    templateIds,
    instantiateTemplate(templateId: string, experienceId: string) {
      const template = brand.value.templates.find((candidate) => candidate.id === templateId);
      if (!template) {
        return {
          ok: false as const,
          issue: issue("TEMPLATE_NOT_FOUND", "$.templateId", "template is not registered by the active brand package"),
        };
      }
      if (!isSemanticNamespace(experienceId)) {
        return {
          ok: false as const,
          issue: issue("INVALID_EXPERIENCE_ID", "$.experienceId", "experience id must be a semantic namespace"),
        };
      }
      const candidate = {
        ...template.document,
        id: experienceId,
      };
      const parsed = parseStudioExperienceDocument(candidate);
      if (!parsed.ok) {
        return {
          ok: false as const,
          issue: issue("INVALID_TEMPLATE_INSTANCE", `$.document${parsed.issue.path === "$" ? "" : parsed.issue.path.slice(1)}`, parsed.issue.message),
        };
      }
      return { ok: true as const, value: parsed.value };
    },
  });

  return { ok: true, value: active };
}
