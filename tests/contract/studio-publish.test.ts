import { describe, expect, it } from "vitest";
import {
  prepareStudioPreview,
  prepareStudioPublication,
} from "../../packages/studio-publish/src/index.js";

function components() {
  return {
    version: "1",
    id: "pegasus.studio.components",
    brandId: "pegasus",
    components: [
      {
        ref: "pegasus.component.button",
        label: "Button",
        category: "actions",
        kind: "action",
        props: [],
        slots: [],
        events: [{ name: "press", label: "Press" }],
      },
      {
        ref: "pegasus.component.flight-list",
        label: "Flight List",
        category: "flight",
        kind: "content",
        props: [{ key: "items", type: "string", required: true, bindable: true }],
        slots: [],
        events: [],
      },
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
    interactions: [{
      viewId: "search",
      nodeId: "submit",
      event: "press",
      actionEvent: "flight.search.submit",
      routes: [{ outcome: "success", viewId: "results" }],
    }],
  };
}

describe("Studio preview and publish", () => {
  it("produces an immutable publication only after all authoring gates pass", () => {
    const result = prepareStudioPublication({ document: document(), componentCatalog: components(), bindingSourceCatalog: sources(), actionAdapter: actions() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe("pegasus.flight-search");
    expect(result.value.manifest).toEqual({
      componentRefs: ["pegasus.component.button", "pegasus.component.flight-list"],
      actionEvents: ["flight.search.submit"],
      bindingSources: ["domain:travel.flight.results"],
    });
    expect(Object.isFrozen(result.value)).toBe(true);
  });

  it("returns a deterministic view-scoped preview descriptor", () => {
    const result = prepareStudioPreview({ document: document(), componentCatalog: components(), bindingSourceCatalog: sources(), actionAdapter: actions(), viewId: "results" });
    expect(result).toMatchObject({
      ok: true,
      value: {
        version: "1",
        experienceId: "pegasus.flight-search",
        viewId: "results",
        manifest: {
          componentRefs: ["pegasus.component.flight-list"],
          actionEvents: [],
          bindingSources: ["domain:travel.flight.results"],
        },
      },
    });
  });

  it("fails publish for an unregistered data source", () => {
    const base = document();
    const input = { ...base, bindings: [{ ...base.bindings[0]!, source: { kind: "domain", path: "travel.flight.secret" } }] };
    expect(prepareStudioPublication({ document: input, componentCatalog: components(), bindingSourceCatalog: sources(), actionAdapter: actions() })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_BINDINGS" },
    });
  });

  it("fails publish for an unregistered action alias", () => {
    const base = document();
    const input = { ...base, interactions: [{ ...base.interactions[0]!, actionEvent: "admin.delete" }] };
    expect(prepareStudioPublication({ document: input, componentCatalog: components(), bindingSourceCatalog: sources(), actionAdapter: actions() })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_FLOW" },
    });
  });

  it("fails preview for unknown views instead of falling back", () => {
    expect(prepareStudioPreview({ document: document(), componentCatalog: components(), bindingSourceCatalog: sources(), actionAdapter: actions(), viewId: "missing" })).toMatchObject({
      ok: false,
      issue: { code: "VIEW_NOT_FOUND" },
    });
  });
});
