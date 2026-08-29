import { describe, expect, it } from "vitest";
import {
  clearStudioOutcomeRoute,
  getStudioFlowEditorOptions,
  setStudioActionBinding,
  setStudioOutcomeRoute,
  validateStudioDocumentFlow,
} from "../../packages/studio-flow/src/index.js";

function components() {
  return {
    version: "1",
    id: "pegasus.studio.components",
    brandId: "pegasus",
    components: [
      {
        ref: "pegasus.component.button",
        label: "Button",
        category: "Actions",
        kind: "action",
        props: [],
        slots: [],
        events: [{ name: "press", label: "Press" }],
      },
      {
        ref: "pegasus.component.text",
        label: "Text",
        category: "Content",
        kind: "content",
        props: [{ key: "text", type: "string", required: true, bindable: false }],
        slots: [],
        events: [],
      },
    ],
  };
}

function actions() {
  return {
    version: "1",
    id: "pegasus.studio.actions",
    mappings: [
      { event: "flight.search.submit", actionType: "travel.flight.search.submit" },
      { event: "flight.select", actionType: "travel.flight.select" },
    ],
  };
}

function document() {
  return {
    version: "1",
    id: "pegasus.flight-search",
    recipeId: "pegasus.flight-search",
    entryView: "search",
    views: [
      { id: "search", nodes: [{ id: "submit", component: "pegasus.component.button", order: 0, props: {} }] },
      { id: "results", nodes: [{ id: "results-text", component: "pegasus.component.text", order: 0, props: { text: "Results" } }] },
      { id: "flexible", nodes: [{ id: "flexible-text", component: "pegasus.component.text", order: 0, props: { text: "Flexible dates" } }] },
      { id: "error", nodes: [{ id: "error-text", component: "pegasus.component.text", order: 0, props: { text: "Try again" } }] },
    ],
    bindings: [],
    interactions: [],
  };
}

describe("Studio actions and outcome flow", () => {
  it("exposes declared component events and exact Action Adapter events", () => {
    const result = getStudioFlowEditorOptions(document(), components(), actions(), "search", "submit");
    expect(result).toMatchObject({
      ok: true,
      value: { events: [{ event: "press", label: "Press" }] },
    });
    if (!result.ok) return;
    expect(result.value.events[0]?.actionEvents).toEqual(["flight.search.submit", "flight.select"]);
    expect(result.value.views).toEqual(["search", "results", "flexible", "error"]);
  });

  it("builds a search action with success, empty and error routes", () => {
    const bound = setStudioActionBinding({
      document: document(), componentCatalog: components(), actionAdapter: actions(), viewId: "search", nodeId: "submit", event: "press", actionEvent: "flight.search.submit",
    });
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    const success = setStudioOutcomeRoute({ document: bound.value, componentCatalog: components(), actionAdapter: actions(), viewId: "search", nodeId: "submit", event: "press", outcome: "success", targetViewId: "results" });
    expect(success.ok).toBe(true);
    if (!success.ok) return;
    const empty = setStudioOutcomeRoute({ document: success.value, componentCatalog: components(), actionAdapter: actions(), viewId: "search", nodeId: "submit", event: "press", outcome: "empty", targetViewId: "flexible" });
    expect(empty.ok).toBe(true);
    if (!empty.ok) return;
    const error = setStudioOutcomeRoute({ document: empty.value, componentCatalog: components(), actionAdapter: actions(), viewId: "search", nodeId: "submit", event: "press", outcome: "error", targetViewId: "error" });
    expect(error).toMatchObject({
      ok: true,
      value: { interactions: [{ actionEvent: "flight.search.submit", routes: [
        { outcome: "success", viewId: "results" },
        { outcome: "empty", viewId: "flexible" },
        { outcome: "error", viewId: "error" },
      ] }] },
    });
  });

  it("rejects undeclared component events and unmapped action aliases", () => {
    expect(setStudioActionBinding({
      document: document(), componentCatalog: components(), actionAdapter: actions(), viewId: "search", nodeId: "submit", event: "hover", actionEvent: "flight.search.submit",
    })).toMatchObject({ ok: false, issue: { code: "UNDECLARED_EVENT" } });
    expect(setStudioActionBinding({
      document: document(), componentCatalog: components(), actionAdapter: actions(), viewId: "search", nodeId: "submit", event: "press", actionEvent: "admin.delete",
    })).toMatchObject({ ok: false, issue: { code: "UNREGISTERED_ACTION_EVENT" } });
  });

  it("rejects routes to unknown views", () => {
    const bound = setStudioActionBinding({
      document: document(), componentCatalog: components(), actionAdapter: actions(), viewId: "search", nodeId: "submit", event: "press", actionEvent: "flight.search.submit",
    });
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    expect(setStudioOutcomeRoute({
      document: bound.value, componentCatalog: components(), actionAdapter: actions(), viewId: "search", nodeId: "submit", event: "press", outcome: "success", targetViewId: "missing",
    })).toMatchObject({ ok: false, issue: { code: "ROUTE_TARGET_NOT_FOUND" } });
  });

  it("removes one route without deleting the action binding", () => {
    const bound = setStudioActionBinding({
      document: document(), componentCatalog: components(), actionAdapter: actions(), viewId: "search", nodeId: "submit", event: "press", actionEvent: "flight.search.submit",
    });
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    const routed = setStudioOutcomeRoute({ document: bound.value, componentCatalog: components(), actionAdapter: actions(), viewId: "search", nodeId: "submit", event: "press", outcome: "success", targetViewId: "results" });
    expect(routed.ok).toBe(true);
    if (!routed.ok) return;
    const cleared = clearStudioOutcomeRoute({ document: routed.value, componentCatalog: components(), actionAdapter: actions(), viewId: "search", nodeId: "submit", event: "press", outcome: "success" });
    expect(cleared).toMatchObject({ ok: true, value: { interactions: [{ actionEvent: "flight.search.submit", routes: [] }] } });
  });

  it("validates pre-existing action aliases exactly", () => {
    const base = document();
    const input = { ...base, interactions: [{ viewId: "search", nodeId: "submit", event: "press", actionEvent: "unknown.event", routes: [] }] };
    expect(validateStudioDocumentFlow(input, components(), actions())).toMatchObject({ ok: false, issue: { code: "UNREGISTERED_ACTION_EVENT" } });
  });
});
