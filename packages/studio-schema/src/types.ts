import type { JsonObject, JsonValue } from "@vira-enterprise-genui/protocol";

export const STUDIO_DOCUMENT_VERSION = "1" as const;
export const STUDIO_MAX_VIEWS = 32 as const;
export const STUDIO_MAX_NODES_PER_VIEW = 256 as const;
export const STUDIO_MAX_BINDINGS = 512 as const;
export const STUDIO_MAX_INTERACTIONS = 512 as const;
export const STUDIO_MAX_ACTION_PAYLOAD_BINDINGS = 64 as const;
export const STUDIO_EVENT_MAX_LENGTH = 128 as const;

export type StudioBindingSourceKind = "state" | "domain" | "scope";
export interface StudioBindingSource { readonly kind: StudioBindingSourceKind; readonly path: string; }
export interface StudioRepeat { readonly source: { readonly kind: "state" | "domain"; readonly path: string } }

export interface StudioNode {
  readonly id: string;
  readonly component: string;
  readonly order: number;
  readonly props: JsonObject;
  readonly parentId?: string;
  readonly slot?: string;
  readonly repeat?: StudioRepeat;
}

export interface StudioView { readonly id: string; readonly nodes: readonly StudioNode[]; }
export interface StudioBinding { readonly viewId: string; readonly nodeId: string; readonly prop: string; readonly source: StudioBindingSource; }
export type StudioInteractionOutcome = "success" | "empty" | "error";
export interface StudioInteractionRoute { readonly outcome: StudioInteractionOutcome; readonly viewId: string; }
export type StudioInteractionPayloadSource = StudioBindingSource | { readonly kind: "literal"; readonly value: JsonValue };
export interface StudioInteractionPayloadBinding { readonly key: string; readonly source: StudioInteractionPayloadSource; }
export interface StudioInteraction {
  readonly viewId: string;
  readonly nodeId: string;
  readonly event: string;
  readonly actionEvent: string;
  readonly routes: readonly StudioInteractionRoute[];
  readonly payloadBindings?: readonly StudioInteractionPayloadBinding[];
}

export interface StudioExperienceDocument {
  readonly version: typeof STUDIO_DOCUMENT_VERSION;
  readonly id: string;
  readonly recipeId: string;
  readonly entryView: string;
  readonly views: readonly StudioView[];
  readonly bindings: readonly StudioBinding[];
  readonly interactions: readonly StudioInteraction[];
}

export type StudioValidationCode =
  | "INVALID_TYPE" | "UNKNOWN_FIELD" | "INVALID_VERSION" | "INVALID_ID" | "INVALID_RECIPE_ID" | "INVALID_ENTRY_VIEW"
  | "INVALID_VIEWS" | "VIEW_LIMIT_EXCEEDED" | "DUPLICATE_VIEW" | "INVALID_NODE" | "NODE_LIMIT_EXCEEDED" | "DUPLICATE_NODE"
  | "INVALID_COMPONENT_REFERENCE" | "INVALID_NODE_ORDER" | "DUPLICATE_NODE_ORDER" | "INVALID_PARENT" | "NODE_CYCLE" | "INVALID_PROPS"
  | "INVALID_REPEAT" | "INVALID_BINDING" | "BINDING_LIMIT_EXCEEDED" | "DUPLICATE_BINDING" | "INVALID_INTERACTION"
  | "INTERACTION_LIMIT_EXCEEDED" | "DUPLICATE_INTERACTION" | "INVALID_ROUTE" | "INVALID_ACTION_PAYLOAD";
export interface StudioValidationIssue { readonly code: StudioValidationCode; readonly path: string; readonly message: string; }
export type StudioExperienceDocumentResult = { readonly ok: true; readonly value: StudioExperienceDocument } | { readonly ok: false; readonly issue: StudioValidationIssue };
