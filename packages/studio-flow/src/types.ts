import type { StudioExperienceDocument, StudioInteractionPayloadBinding, StudioInteractionRoute } from "@vira-enterprise-genui/studio-schema";
import type { StudioCatalogEventPayloadDefinition } from "@vira-enterprise-genui/studio-catalog";
export type StudioFlowValidationCode = "INVALID_ACTION_ADAPTER" | "INVALID_COMPONENT_CATALOG" | "INVALID_DOCUMENT" | "TARGET_NOT_FOUND" | "UNDECLARED_EVENT" | "UNREGISTERED_ACTION_EVENT" | "INTERACTION_NOT_FOUND" | "INVALID_OUTCOME" | "ROUTE_TARGET_NOT_FOUND";
export interface StudioFlowValidationIssue { readonly code: StudioFlowValidationCode; readonly path: string; readonly message: string; }
export type StudioFlowDocumentResult = { readonly ok: true; readonly value: StudioExperienceDocument } | { readonly ok: false; readonly issue: StudioFlowValidationIssue };
export interface StudioFlowEventOption { readonly event: string; readonly label: string; readonly actionEvents: readonly string[]; readonly currentActionEvent?: string; readonly routes: readonly StudioInteractionRoute[]; readonly payload?: readonly StudioCatalogEventPayloadDefinition[]; readonly currentPayloadBindings?: readonly StudioInteractionPayloadBinding[]; }
export interface StudioFlowEditorOptions { readonly views: readonly string[]; readonly events: readonly StudioFlowEventOption[]; }
export type StudioFlowEditorOptionsResult = { readonly ok: true; readonly value: StudioFlowEditorOptions } | { readonly ok: false; readonly issue: StudioFlowValidationIssue };
