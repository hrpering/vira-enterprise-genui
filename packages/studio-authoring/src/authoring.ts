import {
  STUDIO_DOCUMENT_VERSION,
  parseStudioExperienceDocument,
} from "@vira-enterprise-genui/studio-schema";
import type {
  StudioBinding,
  StudioExperienceDocumentResult,
  StudioInteraction,
  StudioValidationIssue,
  StudioView,
} from "@vira-enterprise-genui/studio-schema";
import { prepareStudioPublication } from "@vira-enterprise-genui/studio-publish";
import type {
  StudioPublishResult,
  StudioPublishValidationIssue,
} from "@vira-enterprise-genui/studio-publish";

export interface StudioAuthoringDocumentInput {
  readonly id: string;
  readonly recipeId: string;
  readonly entryView: string;
  readonly views: readonly StudioView[];
  readonly bindings?: readonly StudioBinding[];
  readonly interactions?: readonly StudioInteraction[];
}

export interface StudioAuthoringPublicationInput {
  readonly document: StudioAuthoringDocumentInput;
  readonly componentCatalog: unknown;
  readonly bindingSourceCatalog: unknown;
  readonly actionAdapter: unknown;
}

type StudioPublication = Extract<StudioPublishResult, { readonly ok: true }>["value"];

export type StudioAuthoringPublicationResult =
  | { readonly ok: true; readonly value: StudioPublication }
  | { readonly ok: false; readonly stage: "document"; readonly issue: StudioValidationIssue }
  | { readonly ok: false; readonly stage: "publication"; readonly issue: StudioPublishValidationIssue };

export function defineStudioExperience(
  input: StudioAuthoringDocumentInput,
): StudioExperienceDocumentResult {
  return parseStudioExperienceDocument({
    ...input,
    version: STUDIO_DOCUMENT_VERSION,
    bindings: input.bindings ?? [],
    interactions: input.interactions ?? [],
  });
}

export function prepareAuthoredStudioPublication(
  input: StudioAuthoringPublicationInput,
): StudioAuthoringPublicationResult {
  const document = defineStudioExperience(input.document);
  if (!document.ok) return { ok: false, stage: "document", issue: document.issue };

  const publication = prepareStudioPublication({
    document: document.value,
    componentCatalog: input.componentCatalog,
    bindingSourceCatalog: input.bindingSourceCatalog,
    actionAdapter: input.actionAdapter,
  });
  if (!publication.ok) return { ok: false, stage: "publication", issue: publication.issue };
  return publication;
}
