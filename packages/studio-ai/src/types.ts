import type { StudioCatalogComponentDefinition } from "@vira-enterprise-genui/studio-catalog";
import type { StudioBindingSourceDefinition } from "@vira-enterprise-genui/studio-binding";
import type { StudioExperienceDocument } from "@vira-enterprise-genui/studio-schema";

export const STUDIO_AI_PROMPT_MAX_LENGTH = 16_000 as const;

export interface StudioAiIdentity {
  readonly experienceId: string;
  readonly recipeId: string;
}

export interface StudioAiRequest {
  readonly prompt: string;
  readonly identity: StudioAiIdentity;
  readonly components: readonly StudioCatalogComponentDefinition[];
  readonly bindingSources: readonly StudioBindingSourceDefinition[];
  readonly actionEvents: readonly string[];
  readonly baseDocument?: StudioExperienceDocument;
}

export interface StudioAiProvider {
  generate(request: StudioAiRequest): unknown | Promise<unknown>;
}

export type StudioAiValidationCode =
  | "INVALID_INPUT"
  | "INVALID_PROMPT"
  | "INVALID_IDENTITY"
  | "INVALID_PROVIDER"
  | "INVALID_COMPONENT_CATALOG"
  | "INVALID_BINDING_SOURCE_CATALOG"
  | "INVALID_ACTION_ADAPTER"
  | "INVALID_BASE_DOCUMENT"
  | "PROVIDER_FAILED"
  | "INVALID_CANDIDATE"
  | "IDENTITY_MISMATCH";

export interface StudioAiValidationIssue {
  readonly code: StudioAiValidationCode;
  readonly path: string;
  readonly message: string;
}

export type StudioAiDraftResult =
  | { readonly ok: true; readonly value: StudioExperienceDocument }
  | { readonly ok: false; readonly issue: StudioAiValidationIssue };
