import { describe, expect, it } from "vitest";
import { createRuntimeState } from "../../packages/runtime-core/src/index.js";
import { generateStudioDraft } from "../../packages/studio-ai/src/index.js";
import { setStudioBinding } from "../../packages/studio-binding/src/index.js";
import {
  setStudioActionBinding,
  setStudioOutcomeRoute,
} from "../../packages/studio-flow/src/index.js";
import { createStudioPuckAuthoringSession } from "../../packages/studio-puck-authoring/src/index.js";
import { prepareStudioPublication } from "../../packages/studio-publish/src/index.js";
import { createStudioRuntimeSession } from "../../packages/studio-runtime/src/index.js";

const capability = (id: string) => ({ version: "1", id });

function components() {
  return {
    version: "1",
    id: "pegasus.studio.components",
    brandId: "pegasus",
    components: [
      { ref: "pegasus.layout.stack", label: "Stack", category: "layout", kind: "layout", props: [], slots: [{ name: "content", label: "Content" }], events: [] },
      { ref: "pegasus.component.airport-picker", label: "Airport", category: "flight", kind: "input", props: [{ key: "value", type: "string", required: true, bindable: false }], slots: [], events: [] },
      { ref: "pegasus.component.date-picker", label: "Date", category: "flight", kind: "input", props: [{ key: "value", type: "string", required: true, bindable: false }], slots: [], events: [] },
      { ref: "pegasus.component.button", label: "Button", category: "action", kind: "action", props: [{ key: "label", type: "string", required: true, bindable: false }], slots: [], events: [{ name: "press", label: "Press" }] },
      { ref: "pegasus.component.flight-list", label: "Flight List", category: "flight", kind: "content", props: [{ key: "items", type: "string", required: true, bindable: true }], slots: [], events: [] },
      { ref: "pegasus.component.text", label: "Text", category: "content", kind: "content", props: [{ key: "text", type: "string", required: true, bindable: false }], slots: [], events: [] },
    ],
  };
}

function sources() {
  return {
    version: "1",
    id: "pegasus.studio.data",
    sources: [{ kind: "domain", path: "travel.flight.results", label: "Flight results", valueType: "string" }],
  };
}

function actions() {
  return {
    version: "1",
    id: "pegasus.studio.actions",
    mappings: [{ event: "flight.search.submit", actionType: "travel.flight.search.submit" }],
  };
}

function aiCandidate() {
  return {
    version: "1",
    id: "pegasus.flight-discovery",
    recipeId: "pegasus.flight-discovery",
    entryView: "search",
    views: [
      {
        id: "search",
        nodes: [
          { id: "search-stack", component: "pegasus.layout.stack", order: 0, props: {} },
          { id: "origin", component: "pegasus.component.airport-picker", parentId: "search-stack", slot: "content", order: 0, props: { value: "SAW" } },
          { id: "date", component: "pegasus.component.date-picker", parentId: "search-stack", slot: "content", order: 1, props: { value: "2026-09-15" } },
          { id: "submit", component: "pegasus.component.button", parentId: "search-stack", slot: "content", order: 2, props: { label: "Find flights" } },
        ],
      },
      { id: "results", nodes: [{ id: "flights", component: "pegasus.component.flight-list", order: 0, props: { items: "preview" } }] },
      { id: "flexible", nodes: [{ id: "flexible-text", component: "pegasus.component.text", order: 0, props: { text: "Try flexible dates" } }] },
      { id: "error", nodes: [{ id: "error-text", component: "pegasus.component.text", order: 0, props: { text: "Try again" } }] },
    ],
    bindings: [],
    interactions: [],
  };
}

function aiInput() {
  return {
    prompt: "Create a Pegasus flight search with origin, date, search, results, flexible-date and error states.",
    experienceId: "pegasus.flight-discovery",
    recipeId: "pegasus.flight-discovery",
    componentCatalog: components(),
    bindingSourceCatalog: sources(),
    actionAdapter: actions(),
  };
}

function runtimeState() {
  const plan = {
    version: "1",
    id: "pegasus-studio-golden-plan",
    intent: { version: "1", namespace: "travel.flight", name: "search" },
    state: { origin: "SAW" },
    capabilities: { required: [], available: [capability("search-flights")], future: [] },
  };
  const result = createRuntimeState("pegasus-studio-golden", plan);
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

function permissionPolicy() {
  return { version: "1", rules: [{ subject: "action", id: "travel.flight.search.submit", effect: "allow" }] };
}

async function authoredDocument() {
  const generated = await generateStudioDraft(aiInput(), { generate: () => aiCandidate() });
  if (!generated.ok) throw new Error(generated.issue.message);

  const authoring = createStudioPuckAuthoringSession({
    document: generated.value,
    catalog: components(),
    viewId: "search",
    allocateNodeId: () => "allocated-node",
  });
  if (!authoring.ok) throw new Error(authoring.issue.message);
  const puck = authoring.value.toPuckData();
  if (!puck.ok) throw new Error(puck.issue.message);
  const reconciled = authoring.value.reconcile(puck.value);
  if (!reconciled.ok) throw new Error(reconciled.issue.message);

  const bound = setStudioBinding({
    document: reconciled.value,
    componentCatalog: components(),
    sourceCatalog: sources(),
    viewId: "results",
    nodeId: "flights",
    prop: "items",
    source: { kind: "domain", path: "travel.flight.results" },
  });
  if (!bound.ok) throw new Error(bound.issue.message);

  const action = setStudioActionBinding({
    document: bound.value,
    componentCatalog: components(),
    actionAdapter: actions(),
    viewId: "search",
    nodeId: "submit",
    event: "press",
    actionEvent: "flight.search.submit",
  });
  if (!action.ok) throw new Error(action.issue.message);

  const success = setStudioOutcomeRoute({ document: action.value, componentCatalog: components(), actionAdapter: actions(), viewId: "search", nodeId: "submit", event: "press", outcome: "success", targetViewId: "results" });
  if (!success.ok) throw new Error(success.issue.message);
  const empty = setStudioOutcomeRoute({ document: success.value, componentCatalog: components(), actionAdapter: actions(), viewId: "search", nodeId: "submit", event: "press", outcome: "empty", targetViewId: "flexible" });
  if (!empty.ok) throw new Error(empty.issue.message);
  const error = setStudioOutcomeRoute({ document: empty.value, componentCatalog: components(), actionAdapter: actions(), viewId: "search", nodeId: "submit", event: "press", outcome: "error", targetViewId: "error" });
  if (!error.ok) throw new Error(error.issue.message);
  return error.value;
}

describe("Studio enterprise golden gate", () => {
  it("crosses AI draft, nested Puck, binding, flow, publish and existing runtime action boundaries", async () => {
    const document = await authoredDocument();
    const search = document.views.find((view) => view.id === "search");
    expect(search?.nodes.map((node) => [node.id, node.parentId, node.slot, node.order])).toEqual([
      ["search-stack", undefined, undefined, 0],
      ["origin", "search-stack", "content", 0],
      ["date", "search-stack", "content", 1],
      ["submit", "search-stack", "content", 2],
    ]);
    expect(document.views.find((view) => view.id === "results")?.nodes[0]?.props).toEqual({});

    const published = prepareStudioPublication({ document, componentCatalog: components(), bindingSourceCatalog: sources(), actionAdapter: actions() });
    expect(published.ok).toBe(true);
    if (!published.ok) return;

    let sequence = 0;
    const runtime = createStudioRuntimeSession({
      publication: published.value,
      componentCatalog: components(),
      bindingSourceCatalog: sources(),
      actionAdapter: actions(),
      runtimeState: runtimeState(),
      permissionPolicy: permissionPolicy(),
    }, {
      data: { read: () => "PC201 ₺2,199 | PC203 ₺2,499" },
      actionIds: { nextId: () => `golden-action-${++sequence}` },
    });
    expect(runtime.ok).toBe(true);
    if (!runtime.ok) return;

    const dispatched = runtime.value.dispatch({ nodeId: "submit", event: "press", payload: { origin: "SAW", date: "2026-09-15" } });
    expect(dispatched).toMatchObject({ ok: true, value: { action: { id: "golden-action-1", source: "user", type: "travel.flight.search.submit" } } });
    if (!dispatched.ok) return;
    expect(runtime.value.complete({ actionId: dispatched.value.action.id, outcome: "success" })).toEqual({ ok: true, value: { viewId: "results", transitioned: true } });
    expect(runtime.value.currentView()).toMatchObject({ ok: true, value: { viewId: "results", nodes: [{ id: "flights", props: { items: "PC201 ₺2,199 | PC203 ₺2,499" } }] } });
  });

  it("fails closed across authoring and runtime deny paths", async () => {
    const generated = await generateStudioDraft(aiInput(), { generate: () => aiCandidate() });
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;

    const authoring = createStudioPuckAuthoringSession({ document: generated.value, catalog: components(), viewId: "search", allocateNodeId: () => "allocated-node" });
    expect(authoring.ok).toBe(true);
    if (!authoring.ok) return;
    const puck = authoring.value.toPuckData();
    expect(puck.ok).toBe(true);
    if (!puck.ok) return;
    const forgedPuck = {
      ...puck.value,
      content: [{ ...puck.value.content[0]!, type: "evil.component" }],
    };
    expect(authoring.value.reconcile(forgedPuck)).toMatchObject({ ok: false, issue: { code: "INVALID_PUCK_DATA" } });

    expect(setStudioBinding({
      document: generated.value, componentCatalog: components(), sourceCatalog: sources(), viewId: "results", nodeId: "flights", prop: "items",
      source: { kind: "domain", path: "travel.flight.secret" },
    })).toMatchObject({ ok: false, issue: { code: "UNREGISTERED_SOURCE" } });

    expect(setStudioActionBinding({
      document: generated.value, componentCatalog: components(), actionAdapter: actions(), viewId: "search", nodeId: "submit", event: "press", actionEvent: "admin.delete",
    })).toMatchObject({ ok: false, issue: { code: "UNREGISTERED_ACTION_EVENT" } });

    const document = await authoredDocument();
    const published = prepareStudioPublication({ document, componentCatalog: components(), bindingSourceCatalog: sources(), actionAdapter: actions() });
    expect(published.ok).toBe(true);
    if (!published.ok) return;
    const forgedPublication = { ...published.value, manifest: { ...published.value.manifest, actionEvents: ["admin.delete"] } };
    expect(createStudioRuntimeSession({
      publication: forgedPublication, componentCatalog: components(), bindingSourceCatalog: sources(), actionAdapter: actions(), runtimeState: runtimeState(), permissionPolicy: permissionPolicy(),
    }, { data: { read: () => "x" }, actionIds: { nextId: () => "action-1" } })).toMatchObject({ ok: false, issue: { code: "FORGED_PUBLICATION" } });

    const runtime = createStudioRuntimeSession({
      publication: published.value, componentCatalog: components(), bindingSourceCatalog: sources(), actionAdapter: actions(), runtimeState: runtimeState(), permissionPolicy: permissionPolicy(),
    }, { data: { read: () => "x" }, actionIds: { nextId: () => "action-1" } });
    expect(runtime.ok).toBe(true);
    if (!runtime.ok) return;
    const dispatched = runtime.value.dispatch({ nodeId: "submit", event: "press" });
    expect(dispatched.ok).toBe(true);
    expect(runtime.value.complete({ actionId: "stale-action", outcome: "success" })).toMatchObject({ ok: false, issue: { code: "STALE_ACTION" } });
    expect(runtime.value.currentViewId()).toBe("search");
  });
});