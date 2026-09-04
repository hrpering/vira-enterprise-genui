import type { StudioExperienceDocument } from "@vira-enterprise-genui/studio-schema";

export const VIRA_EXPERIENCE_PACK_COMPOSITION_VERSION = "1" as const;
export const VIRA_EXPERIENCE_PACK_MAX_POLICY_TEMPLATES = 32 as const;

export interface ViraExperiencePackPolicyTemplate {
  readonly id: string;
  readonly provider: string;
  readonly policyRef: string;
}

export interface ViraExperiencePackComposition {
  readonly version: typeof VIRA_EXPERIENCE_PACK_COMPOSITION_VERSION;
  readonly id: string;
  readonly domain: string;
  readonly document: StudioExperienceDocument;
  readonly policyTemplates: readonly ViraExperiencePackPolicyTemplate[];
}

export interface ViraExperiencePackCompositionIssue {
  readonly code:
    | "INVALID_COMPOSITION"
    | "INVALID_DOCUMENT"
    | "INVALID_POLICY_TEMPLATE"
    | "POLICY_TEMPLATE_LIMIT_EXCEEDED"
    | "DUPLICATE_POLICY_TEMPLATE";
  readonly path: string;
  readonly message: string;
}

export type ViraExperiencePackCompositionResult =
  | { readonly ok: true; readonly value: ViraExperiencePackComposition }
  | { readonly ok: false; readonly issue: ViraExperiencePackCompositionIssue };
