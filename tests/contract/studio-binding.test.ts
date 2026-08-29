import { describe, expect, it } from "vitest";
import {
  clearStudioBinding,
  createStudioBindingSourceCatalog,
  getStudioBindingTargets,
  setStudioBinding,
  validateStudioDocumentBindings,
} from "../../packages/studio-binding/src/index.js";

function components() {
  return {
    version: "1",
    id: "pegasus.studio.components",
    brandId: "pegasus",
    components: [
      {
        ref: "pegasus.component.flight-list",
        label: "Flight List",
        category: "flight",
        kind: "content",
        props: [
          { key: "items", type: "string", required: true, bindable: true },
          { key: "compact", type: "boolean", required: false, bindable: false },
        ],
        slots: [],
        events: [],
      },
      {
        ref: "pegasus.component.button",
        label: "Button",
        category: "actions",
        kind: "action",
        props: [{ key: "disabled", type: "boolean", required: false, bindable: true }],
        slots: [],
        events: [{ name: "press", label: "Press" }],
      },
    ],
  };
}

function sources() {
  return {
    version: "1",
    id: "pegasus.studio.data",
    sources: [
      { kind: "domain", path: "travel.flight.results", label: "Flight results", valueType: "string" },
      { kind: "state", path: "search.disabled", label: "Search disabled", valueType: "boolean" },
    ],
  };
}

function document() {
  return {
    version: "1",
    id: "pegasus.flight-search",
    recipeId: "pegasus.flight-search",
    entryView: "results",
    views: [{
      id: "results",
      nodes: [
        { id: "flights", component: "pegasus.component.flight-list", order: 0, props: { items: "fixture" } },
        { id: "search", component: "pegasus.component.button", order: 1, props: { disabled: false } },
      ],
    }],
    bindings: [],
    interactions: [],
  };
}

describe("Studio data binding", () => {
  it("normalizes an exact source catalog", () => {
    const result = createStudioBindingSourceCatalog(sources());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(result.value.sources.map((source) => `${source.kind}:${source.path}`)).toEqual([
      "domain:travel.flight.results",
      "state:search.disabled",
    ]);
  });

  it("lists only compatible sources for bindable props", () => {
    const result = getStudioBindingTargets(document(), components(), sources(), "results", "search");
    expect(result).toMatchObject({ ok: true, value: [{ prop: "disabled", valueType: "boolean" }] });
    if (!result.ok) return;
    expect(result.value[0]?.compatibleSources.map((source) => source.path)).toEqual(["search.disabled"]);
  });

  it("sets a binding and removes the competing static prop", () => {
    const result = setStudioBinding({
      document: document(),
      componentCatalog: components(),
      sourceCatalog: sources(),
      viewId: "results",
      nodeId: "flights",
      prop: "items",
      source: { kind: "domain", path: "travel.flight.results" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.bindings).toEqual([{ viewId: "results", nodeId: "flights", prop: "items", source: { kind: "domain", path: "travel.flight.results" } }]);
    expect(result.value.views[0]?.nodes[0]?.props).toEqual({});
  });

  it("rejects unregistered and type-incompatible sources", () => {
    expect(setStudioBinding({
      document: document(), componentCatalog: components(), sourceCatalog: sources(), viewId: "results", nodeId: "search", prop: "disabled",
      source: { kind: "domain", path: "travel.flight.results" },
    })).toMatchObject({ ok: false, issue: { code: "INCOMPATIBLE_SOURCE" } });
    expect(setStudioBinding({
      document: document(), componentCatalog: components(), sourceCatalog: sources(), viewId: "results", nodeId: "search", prop: "disabled",
      source: { kind: "state", path: "unknown.path" },
    })).toMatchObject({ ok: false, issue: { code: "UNREGISTERED_SOURCE" } });
  });

  it("rejects binding a non-bindable prop", () => {
    expect(setStudioBinding({
      document: document(), componentCatalog: components(), sourceCatalog: sources(), viewId: "results", nodeId: "flights", prop: "compact",
      source: { kind: "state", path: "search.disabled" },
    })).toMatchObject({ ok: false, issue: { code: "UNBINDABLE_PROP" } });
  });

  it("fails closed when clearing a required binding would leave no value", () => {
    const bound = setStudioBinding({
      document: document(), componentCatalog: components(), sourceCatalog: sources(), viewId: "results", nodeId: "flights", prop: "items",
      source: { kind: "domain", path: "travel.flight.results" },
    });
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    expect(clearStudioBinding({
      document: bound.value, componentCatalog: components(), sourceCatalog: sources(), viewId: "results", nodeId: "flights", prop: "items",
    })).toMatchObject({ ok: false, issue: { code: "REQUIRED_VALUE_MISSING" } });
  });

  it("validates pre-existing binding sources exactly", () => {
    const base = document();
    const input = {
      ...base,
      views: [{
        ...base.views[0]!,
        nodes: [base.views[0]!.nodes[0]!, { ...base.views[0]!.nodes[1]!, props: {} }],
      }],
      bindings: [{ viewId: "results", nodeId: "search", prop: "disabled", source: { kind: "state", path: "unknown.path" } }],
    };
    expect(validateStudioDocumentBindings(input, components(), sources())).toMatchObject({ ok: false, issue: { code: "UNREGISTERED_SOURCE" } });
  });
});
