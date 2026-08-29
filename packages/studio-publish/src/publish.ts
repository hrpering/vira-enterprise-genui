import { compileStudioExperience } from "@vira-enterprise-genui/studio-compiler";
import { validateStudioDocumentBindings } from "@vira-enterprise-genui/studio-binding";
import { validateStudioDocumentFlow } from "@vira-enterprise-genui/studio-flow";
import { STUDIO_PREVIEW_VERSION } from "./types.js";
import type { StudioPreviewResult, StudioPublishResult, StudioPublishValidationCode } from "./types.js";

function publishFailure(code: StudioPublishValidationCode, path: string, message: string): StudioPublishResult {
  return { ok: false, issue: { code, path, message } };
}

function previewFailure(code: StudioPublishValidationCode, path: string, message: string): StudioPreviewResult {
  return { ok: false, issue: { code, path, message } };
}

function nestedPath(base: string, path: string): string {
  return path === "$" ? base : `${base}${path.slice(1)}`;
}

function sorted(values: Iterable<string>): readonly string[] {
  return Object.freeze([...new Set(values)].sort((left, right) => left.localeCompare(right)));
}

function freezeData<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) freezeData(item);
    return Object.freeze(value);
  }
  const object = value as Record<string, unknown>;
  for (const key of Object.keys(object)) freezeData(object[key]);
  return Object.freeze(value);
}

export function prepareStudioPublication(input: {
  readonly document: unknown;
  readonly componentCatalog: unknown;
  readonly bindingSourceCatalog: unknown;
  readonly actionAdapter: unknown;
}): StudioPublishResult {
  const bindings = validateStudioDocumentBindings(input.document, input.componentCatalog, input.bindingSourceCatalog);
  if (!bindings.ok) return publishFailure("INVALID_BINDINGS", nestedPath("$.document", bindings.issue.path), bindings.issue.message);
  const flow = validateStudioDocumentFlow(bindings.value, input.componentCatalog, input.actionAdapter);
  if (!flow.ok) return publishFailure("INVALID_FLOW", nestedPath("$.document", flow.issue.path), flow.issue.message);
  const compiled = compileStudioExperience(flow.value);
  if (!compiled.ok) return publishFailure("COMPILATION_FAILED", nestedPath("$.document", compiled.issue.path), compiled.issue.message);
  return { ok: true, value: compiled.value };
}

export function prepareStudioPreview(input: {
  readonly document: unknown;
  readonly componentCatalog: unknown;
  readonly bindingSourceCatalog: unknown;
  readonly actionAdapter: unknown;
  readonly viewId: string;
}): StudioPreviewResult {
  const publication = prepareStudioPublication(input);
  if (!publication.ok) return { ok: false, issue: publication.issue };
  const view = publication.value.document.views.find((candidate) => candidate.id === input.viewId);
  if (!view) return previewFailure("VIEW_NOT_FOUND", "$.viewId", "preview view does not exist in the validated Studio publication");
  const bindings = publication.value.document.bindings.filter((binding) => binding.viewId === input.viewId);
  const interactions = publication.value.document.interactions.filter((interaction) => interaction.viewId === input.viewId);
  const manifest = {
    componentRefs: sorted(view.nodes.map((node) => node.component)),
    actionEvents: sorted(interactions.map((interaction) => interaction.actionEvent)),
    bindingSources: sorted(bindings.map((binding) => `${binding.source.kind}:${binding.source.path}`)),
  };
  return {
    ok: true,
    value: freezeData({
      version: STUDIO_PREVIEW_VERSION,
      experienceId: publication.value.id,
      viewId: input.viewId,
      view,
      bindings,
      interactions,
      manifest,
    }),
  };
}
