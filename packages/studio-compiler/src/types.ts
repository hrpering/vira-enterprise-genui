import type { StudioExperienceDocument, StudioValidationIssue } from "@vira-enterprise-genui/studio-schema";

export const STUDIO_PUBLICATION_VERSION = "1" as const;

export interface StudioDependencyManifest {
  readonly componentRefs: readonly string[];
  readonly actionEvents: readonly string[];
  readonly bindingSources: readonly string[];
}

export interface StudioPublication {
  readonly version: typeof STUDIO_PUBLICATION_VERSION;
  readonly id: string;
  readonly recipeId: string;
  readonly entryView: string;
  readonly document: StudioExperienceDocument;
  readonly manifest: StudioDependencyManifest;
}

export type StudioPublicationResult =
  | { readonly ok: true; readonly value: StudioPublication }
  | { readonly ok: false; readonly issue: StudioValidationIssue };
