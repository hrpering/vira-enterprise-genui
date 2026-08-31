import { createStudioComponentCatalog } from "@vira-enterprise-genui/studio-catalog";
import { parseStudioExperienceDocument } from "@vira-enterprise-genui/studio-schema";
import type { StudioExperienceDocument, StudioInteraction } from "@vira-enterprise-genui/studio-schema";
import {
  clearStudioActionBinding as legacyClearAction,
  clearStudioOutcomeRoute as legacyClearRoute,
  getStudioFlowEditorOptions as legacyOptions,
  setStudioActionBinding as legacySetAction,
  setStudioOutcomeRoute as legacySetRoute,
  validateStudioDocumentFlow as legacyValidate,
} from "./validate.js";
import type { StudioFlowDocumentResult, StudioFlowEditorOptionsResult } from "./types.js";

function identity(value: Pick<StudioInteraction, "viewId" | "nodeId" | "event">): string { return `${value.viewId}\u0000${value.nodeId}\u0000${value.event}`; }
function preserve(documentInput: unknown, result: StudioFlowDocumentResult): StudioFlowDocumentResult {
  if (!result.ok) return result;
  const original = parseStudioExperienceDocument(documentInput); if (!original.ok) return result;
  const payloads = new Map(original.value.interactions.filter((interaction) => (interaction.payloadBindings?.length ?? 0) > 0).map((interaction) => [identity(interaction), interaction.payloadBindings] as const));
  const candidate: StudioExperienceDocument = { ...result.value, interactions: result.value.interactions.map((interaction) => { const payloadBindings = payloads.get(identity(interaction)); return payloadBindings === undefined ? interaction : { ...interaction, payloadBindings }; }) };
  const parsed = parseStudioExperienceDocument(candidate); return parsed.ok ? { ok: true, value: parsed.value } : result;
}
export function validateStudioDocumentFlow(documentInput: unknown, componentCatalogInput: unknown, actionAdapterInput: unknown): StudioFlowDocumentResult { return legacyValidate(documentInput, componentCatalogInput, actionAdapterInput); }
export function getStudioFlowEditorOptions(documentInput: unknown, componentCatalogInput: unknown, actionAdapterInput: unknown, viewId: string, nodeId: string): StudioFlowEditorOptionsResult {
  const base = legacyOptions(documentInput, componentCatalogInput, actionAdapterInput, viewId, nodeId); if (!base.ok) return base;
  const document = parseStudioExperienceDocument(documentInput); const catalog = createStudioComponentCatalog(componentCatalogInput); if (!document.ok || !catalog.ok) return base;
  const node = document.value.views.find((view) => view.id === viewId)?.nodes.find((candidate) => candidate.id === nodeId); const component = catalog.value.components.find((candidate) => candidate.ref === node?.component);
  return { ok: true, value: { views: base.value.views, events: base.value.events.map((event) => { const definition = component?.events.find((candidate) => candidate.name === event.event); const interaction = document.value.interactions.find((candidate) => candidate.viewId === viewId && candidate.nodeId === nodeId && candidate.event === event.event); return { ...event, payload: definition?.payload ?? [], currentPayloadBindings: interaction?.payloadBindings ?? [] }; }) } };
}
export function setStudioActionBinding(input: Parameters<typeof legacySetAction>[0]): StudioFlowDocumentResult { return preserve(input.document, legacySetAction(input)); }
export function clearStudioActionBinding(input: Parameters<typeof legacyClearAction>[0]): StudioFlowDocumentResult { return legacyClearAction(input); }
export function setStudioOutcomeRoute(input: Parameters<typeof legacySetRoute>[0]): StudioFlowDocumentResult { return preserve(input.document, legacySetRoute(input)); }
export function clearStudioOutcomeRoute(input: Parameters<typeof legacyClearRoute>[0]): StudioFlowDocumentResult { return preserve(input.document, legacyClearRoute(input)); }
