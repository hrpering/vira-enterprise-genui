import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { createRuntimeState } from "../../packages/runtime-core/src/index.js";
import { prepareStudioPublication } from "../../packages/studio-publish/src/index.js";
import {
  createStudioRuntimeSession,
  STUDIO_RUNTIME_MAX_REPEAT_ITEMS,
} from "../../packages/studio-runtime/src/index.js";
import { renderStudioRuntimeReactView } from "../../packages/studio-runtime-react/src/index.js";
import type { StudioRuntimeReactRenderContext } from "../../packages/studio-runtime-react/src/index.js";

function components() {
  return {
    version: "1",
    id: "demo.studio.components",
    brandId: "demo.brand",
    components: [
      {
        ref: "demo.layout.stack",
        label: "Stack",
        category: "layout",
        kind: "layout",
        props: [],
        slots: [{ name: "content", label: "Content" }],
        events: [],
      },
      {
        ref: "demo.component.card",
        label: "Card",
        category: "content",
        kind: "content",
        props: [{ key: "title", type: "string", required: true, bindable: true }],
        slots: [{ name: "content", label: "Content" }],
        events: [],
      },
      {
        ref: "demo.component.button",
        label: "Button",
        category: "actions",
        kind: "action",
        props: [{ key: "label", type: "string", required: true, bindable: false }],
        slots: [],
        events: [{
          name: "press",
          label: "Press",
          payload: [{ key: "offerId", type: "string", required: true }],
        }],
      },
    ],
  };
}

function sources() {
  return {
    version: "1",
    id: "demo.studio.data",
    sources: [
      { kind: "domain", path: "results.offers", label: "Offers", valueType: "array" },
      { kind: "scope", path: "currentItem.title", label: "Current offer title", valueType: "string" },
      { kind: "scope", path: "currentItem.id", label: "Current offer id", valueType: "string" },
    ],
  };
}

function actions() {
  return {
    version: "1",
    id: "demo.studio.actions",
    mappings: [{ event: "offer.select", actionType: "travel.flight.offer.select" }],
  };
}

function document() {
  return {
    version: "1",
    id: "demo.flight-results",
    recipeId: "travel.flight.results",
    entryView: "main",
    views: [{
      id: "main",
      nodes: [
        { id: "root", component: "demo.layout.stack", order: 0, props: {} },
        {
          id: "offer-card",
          component: "demo.component.card",
          parentId: "root",
          slot: "content",
          order: 0,
          props: {},
          repeat: { source: { kind: "domain", path: "results.offers" } },
        },
        {
          id: "choose",
          component: "demo.component.button",
          parentId: "offer-card",
          slot: "content",
          order: 0,
          props: { label: "Choose" },
        },
      ],
    }],
    bindings: [{
      viewId: "main",
      nodeId: "offer-card",
      prop: "title",
      source: { kind: "scope", path: "currentItem.title" },
    }],
    interactions: [{
      viewId: "main",
      nodeId: "choose",
      event: "press",
      actionEvent: "offer.select",
      routes: [],
      payloadBindings: [{
        key: "offerId",
        source: { kind: "scope", path: "currentItem.id" },
      }],
    }],
  };
}

function publication() {
  const result = prepareStudioPublication({
    document: document(),
    componentCatalog: components(),
    bindingSourceCatalog: sources(),
    actionAdapter: actions(),
  });
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

function runtimeState() {
  const result = createRuntimeState("demo-flight-results", {
    version: "1",
    id: "demo-flight-results-plan",
    intent: { version: "1", namespace: "travel.flight", name: "results" },
    state: {},
    capabilities: { required: [], available: [], future: [] },
  });
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

function policy() {
  return {
    version: "1",
    rules: [{ subject: "action", id: "travel.flight.offer.select", effect: "allow" }],
  };
}

function sessionFor(offers: readonly unknown[]) {
  let sequence = 0;
  const result = createStudioRuntimeSession({
    publication: publication(),
    componentCatalog: components(),
    bindingSourceCatalog: sources(),
    actionAdapter: actions(),
    runtimeState: runtimeState(),
    permissionPolicy: policy(),
  }, {
    data: {
      read: (source) => source.path === "results.offers" ? offers : undefined,
    },
    actionIds: { nextId: () => `collection-action-${++sequence}` },
  });
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

describe("Studio collection runtime", () => {
  it("expands empty, one and many records without changing the authored node graph", () => {
    const authoredCount = document().views[0]!.nodes.length;
    expect(authoredCount).toBe(3);

    const empty = sessionFor([]).currentView();
    expect(empty).toMatchObject({ ok: true, value: { nodes: [{ sourceNodeId: "root" }] } });

    const one = sessionFor([{ id: "OFFER-1", title: "09:10 · SAW → BER" }]).currentView();
    expect(one.ok).toBe(true);
    if (one.ok) {
      expect(one.value.nodes).toHaveLength(3);
      expect(one.value.nodes.find((node) => node.sourceNodeId === "offer-card")?.props.title).toBe("09:10 · SAW → BER");
    }

    const many = sessionFor([
      { id: "OFFER-1", title: "09:10 · SAW → BER" },
      { id: "OFFER-2", title: "12:35 · SAW → BER" },
    ]).currentView();
    expect(many.ok).toBe(true);
    if (many.ok) {
      expect(many.value.nodes).toHaveLength(5);
      expect(many.value.nodes.filter((node) => node.sourceNodeId === "offer-card").map((node) => node.props.title)).toEqual([
        "09:10 · SAW → BER",
        "12:35 · SAW → BER",
      ]);
      expect(document().views[0]!.nodes).toHaveLength(authoredCount);
    }
  });

  it("maps current-item payloads and overrides renderer-supplied payload fields", () => {
    const session = sessionFor([
      { id: "OFFER-1", title: "Morning" },
      { id: "OFFER-2", title: "Noon" },
    ]);
    const emits: StudioRuntimeReactRenderContext["emit"][] = [];
    const rendered = renderStudioRuntimeReactView({
      session,
      componentCatalog: components(),
      renderers: {
        "demo.layout.stack": ({ slots }: StudioRuntimeReactRenderContext) => createElement("div", null, ...slots.content ?? []),
        "demo.component.card": ({ props, slots }: StudioRuntimeReactRenderContext) => createElement("section", null, String(props.title), ...slots.content ?? []),
        "demo.component.button": ({ emit }: StudioRuntimeReactRenderContext) => {
          emits.push(emit);
          return createElement("button", null, "Choose");
        },
      },
    });
    expect(rendered.ok).toBe(true);
    expect(emits).toHaveLength(2);

    const dispatched = emits[1]?.("press", { offerId: "FORGED", extra: "kept" });
    expect(dispatched?.ok).toBe(true);
    if (!dispatched?.ok) return;
    expect(dispatched.value.action.payload).toEqual({ offerId: "OFFER-2", extra: "kept" });
  });

  it("fails closed when the trusted collection exceeds the runtime repeat limit", () => {
    const offers = Array.from({ length: STUDIO_RUNTIME_MAX_REPEAT_ITEMS + 1 }, (_, index) => ({
      id: `OFFER-${index}`,
      title: `Offer ${index}`,
    }));
    expect(sessionFor(offers).currentView()).toMatchObject({
      ok: false,
      issue: { code: "REPEAT_LIMIT_EXCEEDED" },
    });
  });
});
