import type { StudioBrandPackage } from "@vira-enterprise-genui/studio-brand";
import type { StudioExperienceDocument } from "@vira-enterprise-genui/studio-schema";

export type StudioTrustedRendererRegistry = Readonly<Record<string, unknown>>;

export type StudioBrandLoaderValidationCode =
  | "INVALID_BRAND_PACKAGE"
  | "INVALID_RENDERER_REGISTRY"
  | "MISSING_RENDERER"
  | "EXTRA_RENDERER"
  | "INVALID_RENDERER"
  | "TEMPLATE_NOT_FOUND"
  | "INVALID_EXPERIENCE_ID"
  | "INVALID_TEMPLATE_INSTANCE";

export interface StudioBrandLoaderIssue {
  readonly code: StudioBrandLoaderValidationCode;
  readonly path: string;
  readonly message: string;
}

export type StudioBrandTemplateInstanceResult =
  | { readonly ok: true; readonly value: StudioExperienceDocument }
  | { readonly ok: false; readonly issue: StudioBrandLoaderIssue };

export interface ActiveStudioBrand<
  TAuthoring extends StudioTrustedRendererRegistry = StudioTrustedRendererRegistry,
  TRuntime extends StudioTrustedRendererRegistry = StudioTrustedRendererRegistry,
> {
  readonly package: StudioBrandPackage;
  readonly authoringRenderers: TAuthoring;
  readonly runtimeRenderers: TRuntime;
  readonly templateIds: readonly string[];
  instantiateTemplate(templateId: string, experienceId: string): StudioBrandTemplateInstanceResult;
}

export type ActiveStudioBrandResult<
  TAuthoring extends StudioTrustedRendererRegistry,
  TRuntime extends StudioTrustedRendererRegistry,
> =
  | { readonly ok: true; readonly value: ActiveStudioBrand<TAuthoring, TRuntime> }
  | { readonly ok: false; readonly issue: StudioBrandLoaderIssue };
