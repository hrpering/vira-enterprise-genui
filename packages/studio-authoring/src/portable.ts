import {
  exportStudioPortableBundle,
  migrateStudioPortableBundle,
} from "@vira-enterprise-genui/studio-enterprise";
import type {
  StudioEnterpriseIssue,
  StudioPortableBundle,
} from "@vira-enterprise-genui/studio-enterprise";
import { parseStudioExperienceDocument } from "@vira-enterprise-genui/studio-schema";
import type { StudioExperienceDocument, StudioValidationIssue } from "@vira-enterprise-genui/studio-schema";

export type StudioPortableExportResult =
  | { readonly ok: true; readonly value: StudioPortableBundle }
  | { readonly ok: false; readonly stage: "document"; readonly issue: StudioValidationIssue }
  | { readonly ok: false; readonly stage: "bundle"; readonly issue: StudioEnterpriseIssue };

export type StudioPortableImportResult =
  | { readonly ok: true; readonly brandId: string; readonly document: StudioExperienceDocument; readonly bundle: StudioPortableBundle }
  | { readonly ok: false; readonly stage: "bundle"; readonly issue: StudioEnterpriseIssue };

export function exportAuthoredStudioBundle(input: {
  readonly brandId: string;
  readonly document: unknown;
}): StudioPortableExportResult {
  const document = parseStudioExperienceDocument(input.document);
  if (!document.ok) return { ok: false, stage: "document", issue: document.issue };
  const bundle = exportStudioPortableBundle({ brandId: input.brandId, document: document.value });
  return bundle.ok ? bundle : { ok: false, stage: "bundle", issue: bundle.issue };
}

export function importAuthoredStudioBundle(input: unknown): StudioPortableImportResult {
  const bundle = migrateStudioPortableBundle(input);
  if (!bundle.ok) return { ok: false, stage: "bundle", issue: bundle.issue };
  return {
    ok: true,
    brandId: bundle.value.brandId,
    document: bundle.value.document,
    bundle: bundle.value,
  };
}
