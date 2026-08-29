import type { StudioExperienceDocument } from "@vira-enterprise-genui/studio-schema";

export const STUDIO_COMPONENT_CATALOG_VERSION = "1" as const;
export const STUDIO_CATALOG_MAX_COMPONENTS = 256 as const;
export const STUDIO_CATALOG_MAX_PROPS_PER_COMPONENT = 128 as const;
export const STUDIO_CATALOG_MAX_SLOTS_PER_COMPONENT = 32 as const;
export const STUDIO_CATALOG_MAX_EVENTS_PER_COMPONENT = 64 as const;
export const STUDIO_CATALOG_MAX_ENUM_OPTIONS = 64 as const;
export const STUDIO_CATALOG_LABEL_MAX_LENGTH = 128 as const;

export type StudioCatalogComponentKind = "layout" | "content" | "input" | "action" | "feedback";
export type StudioCatalogPropType = "string" | "number" | "boolean" | "enum";

export interface StudioCatalogPropDefinition {
  readonly key: string;
  readonly type: StudioCatalogPropType;
  readonly required: boolean;
  readonly bindable: boolean;
  readonly options?: readonly string[];
}

export interface StudioCatalogSlotDefinition {
  readonly name: string;
  readonly label: string;
}

export interface StudioCatalogEventDefinition {
  readonly name: string;
  readonly label: string;
}

export interface StudioCatalogComponentDefinition {
  readonly ref: string;
  readonly label: string;
  readonly category: string;
  readonly kind: StudioCatalogComponentKind;
  readonly props: readonly StudioCatalogPropDefinition[];
  readonly slots: readonly StudioCatalogSlotDefinition[];
  readonly events: readonly StudioCatalogEventDefinition[];
}

export interface StudioComponentCatalog {
  readonly version: typeof STUDIO_COMPONENT_CATALOG_VERSION;
  readonly id: string;
  readonly brandId: string;
  readonly components: readonly StudioCatalogComponentDefinition[];
}

export type StudioComponentCatalogValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_VERSION"
  | "INVALID_ID"
  | "INVALID_BRAND_ID"
  | "INVALID_COMPONENTS"
  | "COMPONENT_LIMIT_EXCEEDED"
  | "INVALID_COMPONENT"
  | "DUPLICATE_COMPONENT"
  | "INVALID_COMPONENT_REFERENCE"
  | "INVALID_LABEL"
  | "INVALID_CATEGORY"
  | "INVALID_KIND"
  | "INVALID_PROPS"
  | "PROP_LIMIT_EXCEEDED"
  | "DUPLICATE_PROP"
  | "INVALID_PROP"
  | "INVALID_ENUM_OPTIONS"
  | "INVALID_SLOTS"
  | "SLOT_LIMIT_EXCEEDED"
  | "DUPLICATE_SLOT"
  | "INVALID_SLOT"
  | "INVALID_EVENTS"
  | "EVENT_LIMIT_EXCEEDED"
  | "DUPLICATE_EVENT"
  | "INVALID_EVENT";

export interface StudioComponentCatalogValidationIssue {
  readonly code: StudioComponentCatalogValidationCode;
  readonly path: string;
  readonly message: string;
}

export type StudioComponentCatalogResult =
  | { readonly ok: true; readonly value: StudioComponentCatalog }
  | { readonly ok: false; readonly issue: StudioComponentCatalogValidationIssue };

export type StudioCatalogDocumentValidationCode =
  | "INVALID_CATALOG"
  | "INVALID_DOCUMENT"
  | "UNREGISTERED_COMPONENT"
  | "UNKNOWN_PROP"
  | "INVALID_PROP_VALUE"
  | "MISSING_REQUIRED_PROP"
  | "INVALID_SLOT_TARGET"
  | "UNKNOWN_BINDING_PROP"
  | "UNBINDABLE_PROP"
  | "PROP_SOURCE_CONFLICT"
  | "UNDECLARED_EVENT";

export interface StudioCatalogDocumentValidationIssue {
  readonly code: StudioCatalogDocumentValidationCode;
  readonly path: string;
  readonly message: string;
}

export type StudioCatalogDocumentValidationResult =
  | { readonly ok: true; readonly value: StudioExperienceDocument }
  | { readonly ok: false; readonly issue: StudioCatalogDocumentValidationIssue };

export type ResolveStudioCatalogComponentResult =
  | { readonly ok: true; readonly value: StudioCatalogComponentDefinition }
  | { readonly ok: false; readonly issue: StudioCatalogDocumentValidationIssue };
