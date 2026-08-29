import {
  createActionAdapterContract,
} from "@vira-enterprise-genui/adapter-sdk";
import type { ActionAdapterContract } from "@vira-enterprise-genui/adapter-sdk";
import {
  createStudioComponentCatalog,
  validateStudioDocumentAgainstCatalog,
} from "@vira-enterprise-genui/studio-catalog";
import type {
  StudioCatalogComponentDefinition,
  StudioComponentCatalog,
} from "@vira-enterprise-genui/studio-catalog";
import { parseStudioExperienceDocument } from "@vira-enterprise-genui/studio-schema";
import type {
  StudioExperienceDocument,
  StudioInteraction,
  StudioInteractionOutcome,
} from "@vira-enterprise-genui/studio-schema";
import type {
  StudioFlowDocumentResult,
  StudioFlowEditorOptions,
  StudioFlowEditorOptionsResult,
  StudioFlowValidationCode,
} from "./types.js";

const outcomes = new Set<StudioInteractionOutcome>(["success", "empty", "error"]);

function failure(code: StudioFlowValidationCode, path: string, message: string): StudioFlowDocumentResult {
  return { ok: false, issue: { code, path, message } };
}

function optionsFailure(code: StudioFlowValidationCode, path: string, message: string): StudioFlowEditorOptionsResult {
  return { ok: false, issue: { code, path, message } };
}

function nestedPath(base: string, path: string): string {
  return path === "$" ? base : `${base}${path.slice(1)}`;
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

function componentMap(catalog: StudioComponentCatalog): ReadonlyMap<string, StudioCatalogComponentDefinition> {
  return new Map(catalog.components.map((component) => [component.ref, component] as const));
}

function actionEventSet(adapter: ActionAdapterContract): ReadonlySet<string> {
  return new Set(adapter.mappings.map((mapping) => mapping.event));
}

function validateInputs(
  documentInput: unknown,
  componentCatalogInput: unknown,
  actionAdapterInput: unknown,
):
  | { readonly ok: true; readonly document: StudioExperienceDocument; readonly components: StudioComponentCatalog; readonly actions: ActionAdapterContract }
  | { readonly ok: false; readonly issue: { readonly code: StudioFlowValidationCode; readonly path: string; readonly message: string } } {
  const components = createStudioComponentCatalog(componentCatalogInput);
  if (!components.ok) return { ok: false, issue: { code: "INVALID_COMPONENT_CATALOG", path: nestedPath("$.componentCatalog", components.issue.path), message: components.issue.message } };
  const document = validateStudioDocumentAgainstCatalog(documentInput, components.value);
  if (!document.ok) return { ok: false, issue: { code: "INVALID_DOCUMENT", path: nestedPath("$.document", document.issue.path), message: document.issue.message } };
  const actions = createActionAdapterContract(actionAdapterInput);
  if (!actions.ok) return { ok: false, issue: { code: "INVALID_ACTION_ADAPTER", path: nestedPath("$.actionAdapter", actions.issue.path), message: actions.issue.message } };
  return { ok: true, document: document.value, components: components.value, actions: actions.value };
}

export function validateStudioDocumentFlow(
  documentInput: unknown,
  componentCatalogInput: unknown,
  actionAdapterInput: unknown,
): StudioFlowDocumentResult {
  const inputs = validateInputs(documentInput, componentCatalogInput, actionAdapterInput);
  if (!inputs.ok) return { ok: false, issue: inputs.issue };
  const actionEvents = actionEventSet(inputs.actions);
  for (let index = 0; index < inputs.document.interactions.length; index += 1) {
    const interaction = inputs.document.interactions[index];
    if (!interaction) continue;
    if (!actionEvents.has(interaction.actionEvent)) {
      return failure("UNREGISTERED_ACTION_EVENT", `$.document.interactions[${index}].actionEvent`, "Studio interaction actionEvent is not registered by the active Action Adapter");
    }
  }
  return { ok: true, value: inputs.document };
}

export function getStudioFlowEditorOptions(
  documentInput: unknown,
  componentCatalogInput: unknown,
  actionAdapterInput: unknown,
  viewId: string,
  nodeId: string,
): StudioFlowEditorOptionsResult {
  const validated = validateStudioDocumentFlow(documentInput, componentCatalogInput, actionAdapterInput);
  if (!validated.ok) return { ok: false, issue: validated.issue };
  const components = createStudioComponentCatalog(componentCatalogInput);
  const actions = createActionAdapterContract(actionAdapterInput);
  if (!components.ok || !actions.ok) return optionsFailure("INVALID_DOCUMENT", "$", "validated Studio flow inputs became unavailable");
  const view = validated.value.views.find((candidate) => candidate.id === viewId);
  const node = view?.nodes.find((candidate) => candidate.id === nodeId);
  if (!view || !node) return optionsFailure("TARGET_NOT_FOUND", "$.nodeId", "Studio flow target node does not exist");
  const component = componentMap(components.value).get(node.component);
  if (!component) return optionsFailure("TARGET_NOT_FOUND", "$.nodeId", "Studio flow component metadata does not exist");
  const actionEvents = Object.freeze(actions.value.mappings.map((mapping) => mapping.event).sort((left, right) => left.localeCompare(right)));
  const events = component.events.map((event) => {
    const interaction = validated.value.interactions.find((candidate) => candidate.viewId === viewId && candidate.nodeId === nodeId && candidate.event === event.name);
    return {
      event: event.name,
      label: event.label,
      actionEvents,
      ...(interaction === undefined ? {} : { currentActionEvent: interaction.actionEvent }),
      routes: interaction?.routes ?? [],
    };
  });
  const value: StudioFlowEditorOptions = {
    views: validated.value.views.map((candidate) => candidate.id),
    events,
  };
  return { ok: true, value: freezeData(value) };
}

function mutateInteraction(input: {
  readonly document: unknown;
  readonly componentCatalog: unknown;
  readonly actionAdapter: unknown;
  readonly viewId: string;
  readonly nodeId: string;
  readonly event: string;
  readonly actionEvent?: string;
  readonly route?: { readonly outcome: StudioInteractionOutcome; readonly viewId?: string };
  readonly remove?: boolean;
}): StudioFlowDocumentResult {
  const inputs = validateInputs(input.document, input.componentCatalog, input.actionAdapter);
  if (!inputs.ok) return { ok: false, issue: inputs.issue };
  const view = inputs.document.views.find((candidate) => candidate.id === input.viewId);
  const node = view?.nodes.find((candidate) => candidate.id === input.nodeId);
  if (!view || !node) return failure("TARGET_NOT_FOUND", "$.nodeId", "Studio flow target node does not exist");
  const component = componentMap(inputs.components).get(node.component);
  const event = component?.events.find((candidate) => candidate.name === input.event);
  if (!event) return failure("UNDECLARED_EVENT", "$.event", "event is not declared by the target component");

  const identity = (candidate: StudioInteraction): boolean => candidate.viewId === input.viewId && candidate.nodeId === input.nodeId && candidate.event === input.event;
  const existing = inputs.document.interactions.find(identity);
  let interactions = inputs.document.interactions.filter((candidate) => !identity(candidate));

  if (!input.remove) {
    const actionEvent = input.actionEvent ?? existing?.actionEvent;
    if (actionEvent === undefined) return failure("INTERACTION_NOT_FOUND", "$.actionEvent", "action binding must exist before editing routes");
    if (!actionEventSet(inputs.actions).has(actionEvent)) return failure("UNREGISTERED_ACTION_EVENT", "$.actionEvent", "selected action event is not registered by the active Action Adapter");
    let routes = [...(existing?.routes ?? [])];
    if (input.route !== undefined) {
      if (!outcomes.has(input.route.outcome)) return failure("INVALID_OUTCOME", "$.route.outcome", "route outcome must be success, empty, or error");
      routes = routes.filter((candidate) => candidate.outcome !== input.route?.outcome);
      if (input.route.viewId !== undefined) {
        if (!inputs.document.views.some((candidate) => candidate.id === input.route?.viewId)) return failure("ROUTE_TARGET_NOT_FOUND", "$.route.viewId", "route target view does not exist");
        routes.push({ outcome: input.route.outcome, viewId: input.route.viewId });
      }
    }
    interactions = [...interactions, {
      viewId: input.viewId,
      nodeId: input.nodeId,
      event: input.event,
      actionEvent,
      routes,
    }];
  } else if (!existing) {
    return failure("INTERACTION_NOT_FOUND", "$.event", "Studio action binding does not exist");
  }

  const candidate = { ...inputs.document, interactions };
  const parsed = parseStudioExperienceDocument(candidate);
  if (!parsed.ok) return failure("INVALID_DOCUMENT", nestedPath("$.document", parsed.issue.path), parsed.issue.message);
  const catalogValidated = validateStudioDocumentAgainstCatalog(parsed.value, inputs.components);
  if (!catalogValidated.ok) return failure("INVALID_DOCUMENT", nestedPath("$.document", catalogValidated.issue.path), catalogValidated.issue.message);
  return validateStudioDocumentFlow(catalogValidated.value, inputs.components, inputs.actions);
}

export function setStudioActionBinding(input: {
  readonly document: unknown;
  readonly componentCatalog: unknown;
  readonly actionAdapter: unknown;
  readonly viewId: string;
  readonly nodeId: string;
  readonly event: string;
  readonly actionEvent: string;
}): StudioFlowDocumentResult {
  return mutateInteraction(input);
}

export function clearStudioActionBinding(input: {
  readonly document: unknown;
  readonly componentCatalog: unknown;
  readonly actionAdapter: unknown;
  readonly viewId: string;
  readonly nodeId: string;
  readonly event: string;
}): StudioFlowDocumentResult {
  return mutateInteraction({ ...input, remove: true });
}

export function setStudioOutcomeRoute(input: {
  readonly document: unknown;
  readonly componentCatalog: unknown;
  readonly actionAdapter: unknown;
  readonly viewId: string;
  readonly nodeId: string;
  readonly event: string;
  readonly outcome: StudioInteractionOutcome;
  readonly targetViewId: string;
}): StudioFlowDocumentResult {
  return mutateInteraction({ ...input, route: { outcome: input.outcome, viewId: input.targetViewId } });
}

export function clearStudioOutcomeRoute(input: {
  readonly document: unknown;
  readonly componentCatalog: unknown;
  readonly actionAdapter: unknown;
  readonly viewId: string;
  readonly nodeId: string;
  readonly event: string;
  readonly outcome: StudioInteractionOutcome;
}): StudioFlowDocumentResult {
  return mutateInteraction({ ...input, route: { outcome: input.outcome } });
}
