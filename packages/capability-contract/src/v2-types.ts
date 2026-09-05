import type {
  ViraCapabilityExactReference,
  ViraCapabilityMetadata,
  ViraCapabilityPublisher,
  ViraCapabilityQueryInvocation,
  ViraCapabilityValidationCode,
  ViraCapabilityValueContract,
} from "./types.js";

export const VIRA_CAPABILITY_DEFINITION_V2_SCHEMA_VERSION = "2" as const;

export interface ViraCapabilityActionInvocationV2 {
  readonly kind: "action";
  readonly actionRef: ViraCapabilityExactReference;
}

export type ViraCapabilityInvocationV2 =
  | ViraCapabilityQueryInvocation
  | ViraCapabilityActionInvocationV2;

export interface ViraCapabilityDefinitionV2 {
  readonly schemaVersion: typeof VIRA_CAPABILITY_DEFINITION_V2_SCHEMA_VERSION;
  readonly id: string;
  readonly version: string;
  readonly publisher: ViraCapabilityPublisher;
  readonly metadata: ViraCapabilityMetadata;
  readonly input: ViraCapabilityValueContract;
  readonly output: ViraCapabilityValueContract;
  readonly contextRequirements: readonly ViraCapabilityExactReference[];
  readonly invocation: ViraCapabilityInvocationV2;
}

export interface ViraCapabilityDefinitionV2ValidationIssue {
  readonly code: ViraCapabilityValidationCode;
  readonly path: string;
  readonly message: string;
}

export type ViraCapabilityDefinitionV2Result =
  | { readonly ok: true; readonly value: ViraCapabilityDefinitionV2 }
  | { readonly ok: false; readonly issue: ViraCapabilityDefinitionV2ValidationIssue };

export type ViraCapabilityDefinitionV2SerializationResult =
  | { readonly ok: true; readonly value: string; readonly definition: ViraCapabilityDefinitionV2 }
  | { readonly ok: false; readonly issue: ViraCapabilityDefinitionV2ValidationIssue };
