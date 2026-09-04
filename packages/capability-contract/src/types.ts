export const VIRA_CAPABILITY_DEFINITION_SCHEMA_VERSION = "1" as const;
export const VIRA_CAPABILITY_NAME_MAX_LENGTH = 120 as const;
export const VIRA_CAPABILITY_DESCRIPTION_MAX_LENGTH = 2_000 as const;
export const VIRA_CAPABILITY_PUBLISHER_NAME_MAX_LENGTH = 120 as const;
export const VIRA_CAPABILITY_MAX_CONTEXT_REQUIREMENTS = 128 as const;

export interface ViraCapabilityPublisher {
  readonly id: string;
  readonly name: string;
}

export interface ViraCapabilityExactReference {
  readonly id: string;
  readonly versionRef: string;
}

export interface ViraCapabilityMetadata {
  readonly name: string;
  readonly description?: string;
}

export interface ViraCapabilityValueContract {
  readonly typeRef: ViraCapabilityExactReference | null;
}

export interface ViraCapabilityQueryInvocation {
  readonly kind: "query";
}

export interface ViraCapabilityActionInvocation {
  readonly kind: "action";
  readonly actionType: string;
}

export type ViraCapabilityInvocation =
  | ViraCapabilityQueryInvocation
  | ViraCapabilityActionInvocation;

export interface ViraCapabilityDefinition {
  readonly schemaVersion: typeof VIRA_CAPABILITY_DEFINITION_SCHEMA_VERSION;
  readonly id: string;
  readonly version: string;
  readonly publisher: ViraCapabilityPublisher;
  readonly metadata: ViraCapabilityMetadata;
  readonly input: ViraCapabilityValueContract;
  readonly output: ViraCapabilityValueContract;
  readonly contextRequirements: readonly ViraCapabilityExactReference[];
  readonly invocation: ViraCapabilityInvocation;
}

export type ViraCapabilityValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_SCHEMA_VERSION"
  | "INVALID_ID"
  | "INVALID_VERSION"
  | "INVALID_PUBLISHER"
  | "INVALID_METADATA"
  | "INVALID_VALUE_CONTRACT"
  | "INVALID_REFERENCE"
  | "FLOATING_REFERENCE"
  | "DUPLICATE_REFERENCE"
  | "CONTEXT_LIMIT_EXCEEDED"
  | "INVALID_INVOCATION"
  | "INVALID_ACTION_TYPE";

export interface ViraCapabilityValidationIssue {
  readonly code: ViraCapabilityValidationCode;
  readonly path: string;
  readonly message: string;
}

export type ViraCapabilityDefinitionResult =
  | { readonly ok: true; readonly value: ViraCapabilityDefinition }
  | { readonly ok: false; readonly issue: ViraCapabilityValidationIssue };

export type ViraCapabilitySerializationResult =
  | { readonly ok: true; readonly value: string; readonly definition: ViraCapabilityDefinition }
  | { readonly ok: false; readonly issue: ViraCapabilityValidationIssue };
