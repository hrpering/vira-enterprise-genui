import type {
  ActionAdapterContract,
  BrandProfile,
} from "@vira-enterprise-genui/adapter-sdk";
import type { StudioBindingSourceCatalog } from "@vira-enterprise-genui/studio-binding";
import type { StudioComponentCatalog } from "@vira-enterprise-genui/studio-catalog";
import type { StudioExperienceDocument } from "@vira-enterprise-genui/studio-schema";

export const STUDIO_BRAND_PACKAGE_VERSION = "1" as const;
export const STUDIO_BRAND_MAX_TEMPLATES = 128 as const;
export const STUDIO_BRAND_TEMPLATE_LABEL_MAX_LENGTH = 128 as const;
export const STUDIO_BRAND_TEMPLATE_DESCRIPTION_MAX_LENGTH = 512 as const;

export interface StudioBrandTemplate {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly document: StudioExperienceDocument;
}

export interface StudioBrandPackage {
  readonly version: typeof STUDIO_BRAND_PACKAGE_VERSION;
  readonly id: string;
  readonly brand: BrandProfile;
  readonly components: StudioComponentCatalog;
  readonly dataSources: StudioBindingSourceCatalog;
  readonly actions: ActionAdapterContract;
  readonly templates: readonly StudioBrandTemplate[];
}

export type StudioBrandPackageValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_VERSION"
  | "INVALID_ID"
  | "INVALID_BRAND_PROFILE"
  | "INVALID_COMPONENT_CATALOG"
  | "BRAND_ID_MISMATCH"
  | "INVALID_BINDING_SOURCE_CATALOG"
  | "INVALID_ACTION_ADAPTER"
  | "INVALID_TEMPLATES"
  | "TEMPLATE_LIMIT_EXCEEDED"
  | "INVALID_TEMPLATE"
  | "DUPLICATE_TEMPLATE"
  | "INVALID_TEMPLATE_DOCUMENT";

export interface StudioBrandPackageValidationIssue {
  readonly code: StudioBrandPackageValidationCode;
  readonly path: string;
  readonly message: string;
}

export type StudioBrandPackageResult =
  | { readonly ok: true; readonly value: StudioBrandPackage }
  | { readonly ok: false; readonly issue: StudioBrandPackageValidationIssue };
