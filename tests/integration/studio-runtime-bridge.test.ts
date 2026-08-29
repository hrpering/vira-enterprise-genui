import { describe, expect, it } from "vitest";
import { createRuntimeState } from "../../packages/runtime-core/src/index.js";
import { prepareStudioPublication } from "../../packages/studio-publish/src/index.js";
import { createStudioRuntimeSession } from "../../packages/studio-runtime/src/index.js";

const capability = (id: string) => ({ version: "1", id });

function components() {
  return {
    version: "1",
    id: "pegasus.studio.components",
    brandId: "pegasus",
    components: [
      { ref: "pegasus.component.button", label: "Button", category: "actions", kind: "action", props: [], slots: [], events: [{ name: "press", label: "Press" }] },
      { ref: "pegasus.component.flight-list", label: "Flight List", category: "flight", kind: "content", props: [{ key: "items", type: "string", required: true, bindable: true }], slots: [], events: [] },
    ],
  };
}

function sources() {
  return { version: "1", id: "pegasus.studio.data", sources: [{ kind: "domain", path: "travel.flight.results", label: "Flight results", valueType: "string" }] };
}

function actions() {
  return { version: "1", id: "pegasus.studio.actions", mappings: [{ event: "flight.search.submit", actionType: "travel.flight.search.submit" }] };
}

function document() {
  return {
    version: "1",
    id: "pegasus.flight-search",
    recipeId: "pegasus.flight-search",
    entryView: "search",
    views: [
      { id: "search", nodes: [{ id: "submit", component: "pegasus.component.button", order: 0, props: {} }] },
      { id: "results", nodes: [{ id: "flights", component: "pegasus.component.flight-list", order: 0, props: {} }] },
    ],
    bindings: [{ viewId: "results", nodeId: "flights", prop: "items", source: { kind: "domain", path: "travel.flight.results" } }],
    interactions: [{ viewId: "search", nodeId: "submit", event: "press", actionEvent: "flight.search.submit", routes: [{ outcome: "success", viewId: "results" }] }],
  };
}

function publication() {
  const result = prepareStudioPublication({ document: document(), componentCatalog: components(), bindingSourceCatalog: sources(), actionAdapter: actions() });
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

function runtimeState() {
  const plan = {
    version: "1",
    id: "studio-runtime-plan",
    intent: { version: "1", namespace: "travel.flight", name: "search" },
    state: {},
    capabilities: { required: [], available: [capability("search-flights")], future: [] },
  };
  const result = createRuntimeState("pegasus-flight-experience", plan);
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

function policy(effect: "allow" | "deny" = "allow") {
  return { version: "1", rules: [{ subject: "action", id: "travel.flight.search.submit", effect }] };
}

function ports(value: unknown = "PC201,PC202") {
  let sequence = 0;
  return {
    data: { read: () => value },
    actionIds: { nextId: () => `studio-action-${++sequence}` },
  };
}

describe("Studio runtime bridge", () => {
  it("dispatches through Runtime Web and transitions only after the correlated host outcome", () => {
    const session = createStudioRuntimeSession({ publication: publication(), componentCatalog: components(), bindingSourceCatalog: sources(), actionAdapter: actions(), runtimeState: runtimeState(), permissionPolicy: policy() }, ports());
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    expect(session.value.currentViewId()).toBe("search");
    const dispatched = session.value.dispatch({ nodeId: "submit", event: "press", payload: { origin: "SAW", destination: "BER" } });
    expect(dispatched).toMatchObject({ ok: true, value: { action: { id: "studio-action-1", source: "user", type: "travel.flight.search.submit" } } });
    if (!dispatched.ok) return;
    expect(session.value.currentViewId()).toBe("search");
    expect(session.value.complete({ actionId: dispatched.value.action.id, outcome: "success" })).toEqual({ ok: true, value: { viewId: "results", transitioned: true } });
    const view = session.value.currentView();
    expect(view).toMatchObject({ ok: true, value: { viewId: "results", nodes: [{ id: "flights", props: { items: "PC201,PC202" } }] } });
  });

  it("rejects stale completion and a second dispatch while one action is pending", () => {
    const session = createStudioRuntimeSession({ publication: publication(), componentCatalog: components(), bindingSourceCatalog: sources(), actionAdapter: actions(), runtimeState: runtimeState(), permissionPolicy: policy() }, ports());
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const first = session.value.dispatch({ nodeId: "submit", event: "press" });
    expect(first.ok).toBe(true);
    expect(session.value.dispatch({ nodeId: "submit", event: "press" })).toMatchObject({ ok: false, stage: "studio", issue: { code: "ACTION_PENDING" } });
    expect(session.value.complete({ actionId: "stale-action", outcome: "success" })).toMatchObject({ ok: false, issue: { code: "STALE_ACTION" } });
  });

  it("rejects a forged publication before creating a runtime session", () => {
    const canonical = publication();
    const forged = { ...canonical, manifest: { ...canonical.manifest, actionEvents: ["admin.delete"] } };
    expect(createStudioRuntimeSession({ publication: forged, componentCatalog: components(), bindingSourceCatalog: sources(), actionAdapter: actions(), runtimeState: runtimeState(), permissionPolicy: policy() }, ports())).toMatchObject({
      ok: false,
      issue: { code: "FORGED_PUBLICATION" },
    });
  });

  it("fails closed when resolved data does not match the component prop type", () => {
    const session = createStudioRuntimeSession({ publication: publication(), componentCatalog: components(), bindingSourceCatalog: sources(), actionAdapter: actions(), runtimeState: runtimeState(), permissionPolicy: policy() }, ports(false));
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const dispatched = session.value.dispatch({ nodeId: "submit", event: "press" });
    expect(dispatched.ok).toBe(true);
    if (!dispatched.ok) return;
    expect(session.value.complete({ actionId: dispatched.value.action.id, outcome: "success" }).ok).toBe(true);
    expect(session.value.currentView()).toMatchObject({ ok: false, issue: { code: "DATA_VALUE_INVALID" } });
  });

  it("keeps denied actions inside the existing Runtime Web permission path", () => {
    const session = createStudioRuntimeSession({ publication: publication(), componentCatalog: components(), bindingSourceCatalog: sources(), actionAdapter: actions(), runtimeState: runtimeState(), permissionPolicy: policy("deny") }, ports());
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const result = session.value.dispatch({ nodeId: "submit", event: "press" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.stage).not.toBe("studio");
    expect(session.value.currentViewId()).toBe("search");
  });
});
