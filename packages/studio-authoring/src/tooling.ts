import { parseStudioExperienceDocument } from "@vira-enterprise-genui/studio-schema";
import type { StudioExperienceDocument, StudioValidationIssue } from "@vira-enterprise-genui/studio-schema";
import { prepareStudioPreview, prepareStudioPublication } from "@vira-enterprise-genui/studio-publish";
import type {
  StudioPreviewDescriptor,
  StudioPublishResult,
  StudioPublishValidationIssue,
} from "@vira-enterprise-genui/studio-publish";

export interface StudioToolingContext {
  readonly componentCatalog: unknown;
  readonly bindingSourceCatalog: unknown;
  readonly actionAdapter: unknown;
}

type StudioPublication = Extract<StudioPublishResult, { readonly ok: true }>["value"];

export type StudioValidationResult =
  | { readonly ok: true; readonly value: StudioExperienceDocument }
  | { readonly ok: false; readonly stage: "document"; readonly issue: StudioValidationIssue };

export type StudioBuildResult =
  | { readonly ok: true; readonly value: StudioPublication }
  | { readonly ok: false; readonly stage: "document"; readonly issue: StudioValidationIssue }
  | { readonly ok: false; readonly stage: "publication"; readonly issue: StudioPublishValidationIssue };

export type StudioToolingPreviewResult =
  | { readonly ok: true; readonly value: StudioPreviewDescriptor }
  | { readonly ok: false; readonly stage: "document"; readonly issue: StudioValidationIssue }
  | { readonly ok: false; readonly stage: "publication"; readonly issue: StudioPublishValidationIssue };

export function validateStudioExperience(input: unknown): StudioValidationResult {
  const document = parseStudioExperienceDocument(input);
  return document.ok ? document : { ok: false, stage: "document", issue: document.issue };
}

export function buildStudioExperience(input: { readonly document: unknown } & StudioToolingContext): StudioBuildResult {
  const document = parseStudioExperienceDocument(input.document);
  if (!document.ok) return { ok: false, stage: "document", issue: document.issue };
  const publication = prepareStudioPublication({ ...input, document: document.value });
  return publication.ok ? publication : { ok: false, stage: "publication", issue: publication.issue };
}

export function previewStudioExperience(
  input: { readonly document: unknown; readonly viewId: string } & StudioToolingContext,
): StudioToolingPreviewResult {
  const document = parseStudioExperienceDocument(input.document);
  if (!document.ok) return { ok: false, stage: "document", issue: document.issue };
  const preview = prepareStudioPreview({ ...input, document: document.value });
  return preview.ok ? preview : { ok: false, stage: "publication", issue: preview.issue };
}
