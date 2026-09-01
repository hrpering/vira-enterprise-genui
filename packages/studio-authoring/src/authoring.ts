import {
  exportStudioPortableBundle,
  migrateStudioPortableBundle,
} from "@vira-enterprise-genui/studio-enterprise";
import type {
  StudioPortableBundleResult,
} from "@vira-enterprise-genui/studio-enterprise";
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
import {
  prepareStudioPreview,
  prepareStudioPublication,
} from "@vira-enterprise-genui/studio-publish";
import type {
  StudioPreviewResult,
  StudioPublishResult,
  StudioPublishValidationIssue,
} from "@vira-enterprise-genui/studio-publish";

export interface StudioAuthoringDocumentInput {
  readonly version?: typeof STUDIO_DOCUMENT_VERSION;
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

export interface StudioAuthoringPreviewInput extends StudioAuthoringPublicationInput {
  readonly viewId: string;
}

export interface StudioAuthoringBundleInput {
  readonly brandId: string;
  readonly document: StudioAuthoringDocumentInput;
}

type StudioPublication = Extract<StudioPublishResult, { readonly ok: true }>["value"];
type StudioPreview = Extract<StudioPreviewResult, { readonly ok: true }>["value"];

export type StudioAuthoringPublicationResult =
  | { readonly ok: true; readonly value: StudioPublication }
  | { readonly ok: false; readonly stage: "document"; readonly issue: StudioValidationIssue }
  | { readonly ok: false; readonly stage: "publication"; readonly issue: StudioPublishValidationIssue };

export type StudioAuthoringPreviewResult =
  | { readonly ok: true; readonly value: StudioPreview }
  | { readonly ok: false; readonly stage: "document"; readonly issue: StudioValidationIssue }
  | { readonly ok: false; readonly stage: "preview"; readonly issue: StudioPublishValidationIssue };

export type StudioAuthoringBundleResult =
  | StudioPortableBundleResult
  | { readonly ok: false; readonly stage: "document"; readonly issue: StudioValidationIssue };

export function defineStudioExperience(
  input: StudioAuthoringDocumentInput,
): StudioExperienceDocumentResult {
  const raw = input as unknown as Readonly<Record<string, unknown>>;
  return parseStudioExperienceDocument({
    ...input,
    ...(Object.hasOwn(raw, "version") ? {} : { version: STUDIO_DOCUMENT_VERSION }),
    ...(Object.hasOwn(raw, "bindings") ? {} : { bindings: [] }),
    ...(Object.hasOwn(raw, "interactions") ? {} : { interactions: [] }),
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

export function prepareAuthoredStudioPreview(
  input: StudioAuthoringPreviewInput,
): StudioAuthoringPreviewResult {
  const document = defineStudioExperience(input.document);
  if (!document.ok) return { ok: false, stage: "document", issue: document.issue };

  const preview = prepareStudioPreview({
    document: document.value,
    componentCatalog: input.componentCatalog,
    bindingSourceCatalog: input.bindingSourceCatalog,
    actionAdapter: input.actionAdapter,
    viewId: input.viewId,
  });
  if (!preview.ok) return { ok: false, stage: "preview", issue: preview.issue };
  return preview;
}

export function exportAuthoredStudioBundle(
  input: StudioAuthoringBundleInput,
): StudioAuthoringBundleResult {
  const document = defineStudioExperience(input.document);
  if (!document.ok) return { ok: false, stage: "document", issue: document.issue };
  return exportStudioPortableBundle({ brandId: input.brandId, document: document.value });
}

export function importAuthoredStudioBundle(input: unknown): StudioPortableBundleResult {
  return migrateStudioPortableBundle(input);
}
