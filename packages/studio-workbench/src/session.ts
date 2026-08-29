import { createActionAdapterContract } from "@vira-enterprise-genui/adapter-sdk";
import { isSemanticSegment } from "@vira-enterprise-genui/protocol";
import {
  clearStudioBinding,
  createStudioBindingSourceCatalog,
  getStudioBindingTargets,
  setStudioBinding,
  validateStudioDocumentBindings,
} from "@vira-enterprise-genui/studio-binding";
import { createStudioComponentCatalog } from "@vira-enterprise-genui/studio-catalog";
import {
  clearStudioActionBinding,
  clearStudioOutcomeRoute,
  getStudioFlowEditorOptions,
  setStudioActionBinding,
  setStudioOutcomeRoute,
  validateStudioDocumentFlow,
} from "@vira-enterprise-genui/studio-flow";
import { createStudioPuckAuthoringSession } from "@vira-enterprise-genui/studio-puck-authoring";
import type { StudioPuckAuthoringSession } from "@vira-enterprise-genui/studio-puck-authoring";
import { prepareStudioPreview, prepareStudioPublication } from "@vira-enterprise-genui/studio-publish";
import { STUDIO_MAX_VIEWS } from "@vira-enterprise-genui/studio-schema";
import type { StudioExperienceDocument } from "@vira-enterprise-genui/studio-schema";
import type {
  CreateStudioWorkbenchSessionInput,
  CreateStudioWorkbenchSessionResult,
  StudioWorkbenchAddViewInput,
  StudioWorkbenchDocumentResult,
  StudioWorkbenchIssue,
  StudioWorkbenchSession,
  StudioWorkbenchValidationCode,
} from "./types.js";

function issue(code: StudioWorkbenchValidationCode, path: string, message: string): StudioWorkbenchIssue {
  return { code, path, message };
}

function failure(code: StudioWorkbenchValidationCode, path: string, message: string): StudioWorkbenchDocumentResult {
  return { ok: false, issue: issue(code, path, message) };
}

function success(value: StudioExperienceDocument): StudioWorkbenchDocumentResult {
  return { ok: true, value };
}

export function createStudioWorkbenchSession(input: CreateStudioWorkbenchSessionInput): CreateStudioWorkbenchSessionResult {
  const components = createStudioComponentCatalog(input.componentCatalog);
  if (!components.ok) return { ok: false, issue: issue("INVALID_INPUT", `$.componentCatalog${components.issue.path.slice(1)}`, components.issue.message) };
  const sources = createStudioBindingSourceCatalog(input.bindingSourceCatalog);
  if (!sources.ok) return { ok: false, issue: issue("INVALID_INPUT", `$.bindingSourceCatalog${sources.issue.path.slice(1)}`, sources.issue.message) };
  const actions = createActionAdapterContract(input.actionAdapter);
  if (!actions.ok) return { ok: false, issue: issue("INVALID_INPUT", `$.actionAdapter${actions.issue.path.slice(1)}`, actions.issue.message) };
  if (typeof input.allocateNodeId !== "function") return { ok: false, issue: issue("INVALID_INPUT", "$.allocateNodeId", "allocateNodeId must be a function") };

  const componentCatalog = components.value;
  const bindingSourceCatalog = sources.value;
  const actionAdapter = actions.value;
  const bindingValidated = validateStudioDocumentBindings(input.document, componentCatalog, bindingSourceCatalog);
  if (!bindingValidated.ok) return { ok: false, issue: issue("INVALID_INPUT", bindingValidated.issue.path, bindingValidated.issue.message) };
  const flowValidated = validateStudioDocumentFlow(bindingValidated.value, componentCatalog, actionAdapter);
  if (!flowValidated.ok) return { ok: false, issue: issue("INVALID_INPUT", flowValidated.issue.path, flowValidated.issue.message) };

  let current: StudioExperienceDocument = flowValidated.value;
  let activeViewId = input.initialViewId ?? current.entryView;
  if (!isSemanticSegment(activeViewId) || !current.views.some((view) => view.id === activeViewId)) {
    return { ok: false, issue: issue("INVALID_VIEW", "$.initialViewId", "initial Studio view does not exist") };
  }

  function createPuck(document: StudioExperienceDocument, viewId: string):
    | { readonly ok: true; readonly value: StudioPuckAuthoringSession }
    | { readonly ok: false; readonly issue: StudioWorkbenchIssue } {
    const created = createStudioPuckAuthoringSession({ document, catalog: componentCatalog, viewId, allocateNodeId: input.allocateNodeId });
    return created.ok
      ? { ok: true, value: created.value }
      : { ok: false, issue: issue("INVALID_PUCK_SESSION", created.issue.path, created.issue.message) };
  }

  const initialPuck = createPuck(current, activeViewId);
  if (!initialPuck.ok) return { ok: false, issue: initialPuck.issue };
  let puckSession: StudioPuckAuthoringSession = initialPuck.value;

  function commit(candidate: unknown, nextViewId: string = activeViewId): StudioWorkbenchDocumentResult {
    const bindings = validateStudioDocumentBindings(candidate, componentCatalog, bindingSourceCatalog);
    if (!bindings.ok) return failure("MUTATION_FAILED", bindings.issue.path, bindings.issue.message);
    const flow = validateStudioDocumentFlow(bindings.value, componentCatalog, actionAdapter);
    if (!flow.ok) return failure("MUTATION_FAILED", flow.issue.path, flow.issue.message);
    if (!flow.value.views.some((view) => view.id === nextViewId)) return failure("INVALID_VIEW", "$.viewId", "next Studio view does not exist");
    const nextPuck = createPuck(flow.value, nextViewId);
    if (!nextPuck.ok) return { ok: false, issue: nextPuck.issue };
    current = flow.value;
    activeViewId = nextViewId;
    puckSession = nextPuck.value;
    return success(current);
  }

  const session: StudioWorkbenchSession = Object.freeze({
    currentDocument: () => current,
    currentViewId: () => activeViewId,
    componentCatalog: () => componentCatalog,
    bindingSourceCatalog: () => bindingSourceCatalog,
    actionAdapter: () => actionAdapter,
    listViews: () => Object.freeze(current.views.map((view) => Object.freeze({ id: view.id, entry: view.id === current.entryView, active: view.id === activeViewId }))),
    selectView: (viewId: string) => {
      if (!isSemanticSegment(viewId) || !current.views.some((view) => view.id === viewId)) return failure("INVALID_VIEW", "$.viewId", "Studio view does not exist");
      const nextPuck = createPuck(current, viewId);
      if (!nextPuck.ok) return { ok: false, issue: nextPuck.issue };
      activeViewId = viewId;
      puckSession = nextPuck.value;
      return success(current);
    },
    addView: (addInput: StudioWorkbenchAddViewInput) => {
      if (!isSemanticSegment(addInput.viewId)) return failure("INVALID_VIEW", "$.viewId", "viewId must be one semantic segment");
      if (current.views.some((view) => view.id === addInput.viewId)) return failure("VIEW_ALREADY_EXISTS", "$.viewId", "Studio view already exists");
      if (current.views.length >= STUDIO_MAX_VIEWS) return failure("VIEW_LIMIT_EXCEEDED", "$.views", "Studio view limit reached");
      if (!isSemanticSegment(addInput.root.id)) return failure("INVALID_ROOT_COMPONENT", "$.root.id", "root node id must be one semantic segment");
      const root = componentCatalog.components.find((component) => component.ref === addInput.root.component);
      if (!root || root.kind !== "layout") return failure("INVALID_ROOT_COMPONENT", "$.root.component", "new Studio views require one registered layout root component");
      return commit({
        ...current,
        views: [...current.views, { id: addInput.viewId, nodes: [{ id: addInput.root.id, component: addInput.root.component, order: 0, props: addInput.root.props ?? {} }] }],
      }, addInput.viewId);
    },
    removeView: (viewId: string) => {
      if (!current.views.some((view) => view.id === viewId)) return failure("INVALID_VIEW", "$.viewId", "Studio view does not exist");
      if (current.views.length <= 1) return failure("LAST_VIEW", "$.viewId", "the last Studio view cannot be removed");
      if (current.entryView === viewId) return failure("ENTRY_VIEW", "$.viewId", "entry view cannot be removed; choose another entry view first");
      if (current.interactions.some((interaction) => interaction.routes.some((route) => route.viewId === viewId))) return failure("VIEW_REFERENCED", "$.viewId", "Studio view is still referenced by an outcome route");
      const nextViewId = activeViewId === viewId ? current.entryView : activeViewId;
      return commit({
        ...current,
        views: current.views.filter((view) => view.id !== viewId),
        bindings: current.bindings.filter((binding) => binding.viewId !== viewId),
        interactions: current.interactions.filter((interaction) => interaction.viewId !== viewId),
      }, nextViewId);
    },
    setEntryView: (viewId: string) => current.views.some((view) => view.id === viewId)
      ? commit({ ...current, entryView: viewId })
      : failure("INVALID_VIEW", "$.viewId", "Studio entry view does not exist"),
    toPuckData: () => puckSession.toPuckData(),
    reconcilePuck: (data) => {
      const reconciled = puckSession.reconcile(data);
      if (!reconciled.ok) return failure("PUCK_RECONCILE_FAILED", reconciled.issue.path, reconciled.issue.message);
      current = reconciled.value;
      return success(current);
    },
    resolveNodeId: (puckId: string) => puckSession.resolveNodeId(puckId),
    bindingTargets: (nodeId: string) => getStudioBindingTargets(current, componentCatalog, bindingSourceCatalog, activeViewId, nodeId),
    setBinding: (value) => {
      const result = setStudioBinding({ document: current, componentCatalog, sourceCatalog: bindingSourceCatalog, viewId: activeViewId, ...value });
      return result.ok ? commit(result.value) : failure("MUTATION_FAILED", result.issue.path, result.issue.message);
    },
    clearBinding: (value) => {
      const result = clearStudioBinding({ document: current, componentCatalog, sourceCatalog: bindingSourceCatalog, viewId: activeViewId, ...value });
      return result.ok ? commit(result.value) : failure("MUTATION_FAILED", result.issue.path, result.issue.message);
    },
    flowOptions: (nodeId: string) => getStudioFlowEditorOptions(current, componentCatalog, actionAdapter, activeViewId, nodeId),
    setAction: (value) => {
      const result = setStudioActionBinding({ document: current, componentCatalog, actionAdapter, viewId: activeViewId, ...value });
      return result.ok ? commit(result.value) : failure("MUTATION_FAILED", result.issue.path, result.issue.message);
    },
    clearAction: (value) => {
      const result = clearStudioActionBinding({ document: current, componentCatalog, actionAdapter, viewId: activeViewId, ...value });
      return result.ok ? commit(result.value) : failure("MUTATION_FAILED", result.issue.path, result.issue.message);
    },
    setRoute: (value) => {
      const result = setStudioOutcomeRoute({ document: current, componentCatalog, actionAdapter, viewId: activeViewId, ...value });
      return result.ok ? commit(result.value) : failure("MUTATION_FAILED", result.issue.path, result.issue.message);
    },
    clearRoute: (value) => {
      const result = clearStudioOutcomeRoute({ document: current, componentCatalog, actionAdapter, viewId: activeViewId, ...value });
      return result.ok ? commit(result.value) : failure("MUTATION_FAILED", result.issue.path, result.issue.message);
    },
    preview: () => prepareStudioPreview({ document: current, componentCatalog, bindingSourceCatalog, actionAdapter, viewId: activeViewId }),
    publish: () => prepareStudioPublication({ document: current, componentCatalog, bindingSourceCatalog, actionAdapter }),
  });

  return { ok: true, value: session };
}
