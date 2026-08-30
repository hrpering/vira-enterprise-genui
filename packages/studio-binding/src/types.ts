import type { StudioBindingSource, StudioExperienceDocument, StudioInteractionPayloadSource } from "@vira-enterprise-genui/studio-schema";

export const STUDIO_BINDING_SOURCE_CATALOG_VERSION = "1" as const;
export const STUDIO_BINDING_MAX_SOURCES = 512 as const;
export const STUDIO_BINDING_LABEL_MAX_LENGTH = 128 as const;
export type StudioBindingValueType = "string" | "number" | "boolean" | "enum" | "array" | "object";
export interface StudioBindingSourceDefinition { readonly kind: "state" | "domain" | "scope"; readonly path: string; readonly label: string; readonly valueType: StudioBindingValueType; }
export interface StudioBindingSourceCatalog { readonly version: typeof STUDIO_BINDING_SOURCE_CATALOG_VERSION; readonly id: string; readonly sources: readonly StudioBindingSourceDefinition[]; }
export type StudioBindingValidationCode =
  | "INVALID_TYPE" | "UNKNOWN_FIELD" | "INVALID_VERSION" | "INVALID_ID" | "INVALID_SOURCES" | "SOURCE_LIMIT_EXCEEDED"
  | "INVALID_SOURCE" | "DUPLICATE_SOURCE" | "INVALID_LABEL" | "INVALID_VALUE_TYPE" | "INVALID_DOCUMENT" | "INVALID_COMPONENT_CATALOG"
  | "UNREGISTERED_SOURCE" | "TARGET_NOT_FOUND" | "UNBINDABLE_PROP" | "INCOMPATIBLE_SOURCE" | "REQUIRED_VALUE_MISSING"
  | "SCOPE_OUTSIDE_REPEAT" | "INVALID_REPEAT_SOURCE" | "PAYLOAD_NOT_FOUND";
export interface StudioBindingValidationIssue { readonly code: StudioBindingValidationCode; readonly path: string; readonly message: string; }
export type StudioBindingSourceCatalogResult = { readonly ok: true; readonly value: StudioBindingSourceCatalog } | { readonly ok: false; readonly issue: StudioBindingValidationIssue };
export type StudioBindingDocumentResult = { readonly ok: true; readonly value: StudioExperienceDocument } | { readonly ok: false; readonly issue: StudioBindingValidationIssue };
export interface StudioBindingTargetOption { readonly prop: string; readonly valueType: StudioBindingValueType; readonly required: boolean; readonly compatibleSources: readonly StudioBindingSourceDefinition[]; readonly currentSource?: StudioBindingSource; }
export type StudioBindingTargetsResult = { readonly ok: true; readonly value: readonly StudioBindingTargetOption[] } | { readonly ok: false; readonly issue: StudioBindingValidationIssue };
export interface StudioRepeatTargetOptions { readonly compatibleSources: readonly StudioBindingSourceDefinition[]; readonly currentSource?: StudioBindingSource; }
export type StudioRepeatTargetsResult = { readonly ok: true; readonly value: StudioRepeatTargetOptions } | { readonly ok: false; readonly issue: StudioBindingValidationIssue };
export interface StudioActionPayloadTargetOption { readonly key: string; readonly valueType: StudioBindingValueType; readonly required: boolean; readonly compatibleSources: readonly StudioBindingSourceDefinition[]; readonly currentSource?: StudioInteractionPayloadSource; }
export type StudioActionPayloadTargetsResult = { readonly ok: true; readonly value: readonly StudioActionPayloadTargetOption[] } | { readonly ok: false; readonly issue: StudioBindingValidationIssue };
