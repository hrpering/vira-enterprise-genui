import type { JsonValue } from "@vira-enterprise-genui/protocol";

export const VIRA_WORK_CONTEXT_DEFINITION_SCHEMA_VERSION = "1" as const;
export const VIRA_WORK_CONTEXT_SCHEMA_VERSION = "1" as const;
export const VIRA_WORK_CONTEXT_NAME_MAX_LENGTH = 120 as const;
export const VIRA_WORK_CONTEXT_DESCRIPTION_MAX_LENGTH = 2_000 as const;
export const VIRA_WORK_CONTEXT_PUBLISHER_NAME_MAX_LENGTH = 120 as const;
export const VIRA_WORK_CONTEXT_MAX_ITEMS = 256 as const;
export const VIRA_WORK_CONTEXT_MAX_PROVENANCE_REFS = 64 as const;
export const VIRA_WORK_CONTEXT_MAX_ID_LENGTH = 128 as const;

export const VIRA_WORK_CONTEXT_ITEM_KINDS = Object.freeze([
  "state",
  "artifact",
  "evidence",
  "result",
  "decision",
  "receipt",
] as const);

export type ViraWorkContextItemKind = (typeof VIRA_WORK_CONTEXT_ITEM_KINDS)[number];

export interface ViraWorkContextExactReference {
  readonly id: string;
  readonly versionRef: string;
}

export interface ViraWorkContextPublisher {
  readonly id: string;
  readonly name: string;
}

export interface ViraWorkContextMetadata {
  readonly name: string;
  readonly description?: string;
}

export interface ViraWorkContextDefinition {
  readonly schemaVersion: typeof VIRA_WORK_CONTEXT_DEFINITION_SCHEMA_VERSION;
  readonly id: string;
  readonly version: string;
  readonly publisher: ViraWorkContextPublisher;
  readonly metadata: ViraWorkContextMetadata;
}

export interface ViraWorkContextProvenance {
  readonly sourceRefs: readonly ViraWorkContextExactReference[];
  readonly observedAtUnixMs: number | null;
}

export interface ViraWorkContextItem {
  readonly id: string;
  readonly kind: ViraWorkContextItemKind;
  readonly typeRef: ViraWorkContextExactReference | null;
  readonly value: JsonValue;
  readonly provenance: ViraWorkContextProvenance;
}

export interface ViraWorkContext {
  readonly schemaVersion: typeof VIRA_WORK_CONTEXT_SCHEMA_VERSION;
  readonly id: string;
  readonly typeRef: ViraWorkContextExactReference;
  readonly items: readonly ViraWorkContextItem[];
}

export type ViraWorkContextValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_SCHEMA_VERSION"
  | "INVALID_ID"
  | "INVALID_VERSION"
  | "INVALID_PUBLISHER"
  | "INVALID_METADATA"
  | "INVALID_REFERENCE"
  | "FLOATING_REFERENCE"
  | "INVALID_CONTEXT_ID"
  | "INVALID_ITEMS"
  | "ITEM_LIMIT_EXCEEDED"
  | "DUPLICATE_ITEM"
  | "INVALID_ITEM"
  | "INVALID_ITEM_KIND"
  | "INVALID_PROVENANCE"
  | "PROVENANCE_LIMIT_EXCEEDED"
  | "DUPLICATE_PROVENANCE_REFERENCE";

export interface ViraWorkContextValidationIssue {
  readonly code: ViraWorkContextValidationCode;
  readonly path: string;
  readonly message: string;
}

export type ViraWorkContextDefinitionResult =
  | { readonly ok: true; readonly value: ViraWorkContextDefinition }
  | { readonly ok: false; readonly issue: ViraWorkContextValidationIssue };

export type ViraWorkContextResult =
  | { readonly ok: true; readonly value: ViraWorkContext }
  | { readonly ok: false; readonly issue: ViraWorkContextValidationIssue };

export type ViraWorkContextDefinitionSerializationResult =
  | { readonly ok: true; readonly value: string; readonly definition: ViraWorkContextDefinition }
  | { readonly ok: false; readonly issue: ViraWorkContextValidationIssue };

export type ViraWorkContextSerializationResult =
  | { readonly ok: true; readonly value: string; readonly context: ViraWorkContext }
  | { readonly ok: false; readonly issue: ViraWorkContextValidationIssue };
