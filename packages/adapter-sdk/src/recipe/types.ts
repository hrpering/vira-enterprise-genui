import type { Capability } from "@vira-enterprise-genui/protocol";

export const EXPERIENCE_RECIPE_VERSION = "1" as const;
export const EXPERIENCE_RECIPE_MAX_REQUIREMENTS = 128 as const;

export interface ExperienceRecipeIntentIdentity {
  readonly namespace: string;
  readonly name: string;
}

export interface ExperienceRecipeCapabilityRequirement {
  readonly field: string;
  readonly capability: Capability;
}

export interface ExperienceRecipe {
  readonly version: typeof EXPERIENCE_RECIPE_VERSION;
  readonly id: string;
  readonly intent: ExperienceRecipeIntentIdentity;
  readonly requiredState: readonly string[];
  readonly capabilityRequirements: readonly ExperienceRecipeCapabilityRequirement[];
  readonly availableCapabilities: readonly Capability[];
  readonly futureCapabilities: readonly Capability[];
}

export type ExperienceRecipeValidationCode =
  | "INVALID_TYPE"
  | "UNKNOWN_FIELD"
  | "INVALID_VERSION"
  | "INVALID_ID"
  | "INVALID_INTENT"
  | "INVALID_REQUIRED_STATE"
  | "REQUIREMENT_LIMIT_EXCEEDED"
  | "DUPLICATE_REQUIRED_STATE"
  | "INVALID_CAPABILITY_REQUIREMENT"
  | "UNDECLARED_REQUIREMENT_FIELD"
  | "DUPLICATE_REQUIREMENT_FIELD"
  | "INVALID_CAPABILITY"
  | "DUPLICATE_CAPABILITY"
  | "CAPABILITY_LIMIT_EXCEEDED"
  | "INTENT_MISMATCH";

export interface ExperienceRecipeValidationIssue {
  readonly code: ExperienceRecipeValidationCode;
  readonly path: string;
  readonly message: string;
}

export type ExperienceRecipeResult =
  | { readonly ok: true; readonly value: ExperienceRecipe }
  | { readonly ok: false; readonly issue: ExperienceRecipeValidationIssue };

export type RecipeIntentMatchResult =
  | { readonly ok: true; readonly value: ExperienceRecipe }
  | { readonly ok: false; readonly issue: ExperienceRecipeValidationIssue };
