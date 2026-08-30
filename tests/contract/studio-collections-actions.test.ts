import { describe, expect, it } from "vitest";
import {
  validateStudioDocumentBindings,
} from "../../packages/studio-binding/src/index.js";
import {
  validateStudioDocumentAgainstCatalog,
} from "../../packages/studio-catalog/src/index.js";
import { prepareStudioPublication } from "../../packages/studio-publish/src/index.js";

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
      { kind: "domain", path: "search.origin", label: "Origin", valueType: "string" },
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

function completeDocument() {
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

function withoutPayload() {
  const document = completeDocument();
  document.interactions[0]!.payloadBindings = [];
  return document;
}

describe("Studio Canvas v2 collections and action payloads", () => {
  it("accepts a repeated scope-bound card and rejects the same scope binding outside repeat", () => {
    expect(validateStudioDocumentBindings(completeDocument(), components(), sources())).toMatchObject({ ok: true });

    const escaped = completeDocument();
    delete escaped.views[0]!.nodes[1]!.repeat;
    expect(validateStudioDocumentBindings(escaped, components(), sources())).toMatchObject({
      ok: false,
      issue: { code: "SCOPE_OUTSIDE_REPEAT" },
    });
  });

  it("requires repeat sources to be registered state/domain arrays", () => {
    const invalid = completeDocument();
    invalid.views[0]!.nodes[1]!.repeat = {
      source: { kind: "domain", path: "search.origin" },
    };
    expect(validateStudioDocumentBindings(invalid, components(), sources())).toMatchObject({
      ok: false,
      issue: { code: "INVALID_REPEAT_SOURCE" },
    });
  });

  it("allows an incomplete action payload in a persisted draft but blocks preview/publication", () => {
    const draft = withoutPayload();
    expect(validateStudioDocumentAgainstCatalog(draft, components())).toMatchObject({ ok: true });
    expect(validateStudioDocumentBindings(draft, components(), sources())).toMatchObject({ ok: true });
    expect(prepareStudioPublication({
      document: draft,
      componentCatalog: components(),
      bindingSourceCatalog: sources(),
      actionAdapter: actions(),
    })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_FLOW" },
    });
  });

  it("publishes after all required event payload fields are mapped", () => {
    const result = prepareStudioPublication({
      document: completeDocument(),
      componentCatalog: components(),
      bindingSourceCatalog: sources(),
      actionAdapter: actions(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.document.interactions[0]?.payloadBindings).toEqual([{ key: "offerId", source: { kind: "scope", path: "currentItem.id" } }]);
    expect(result.value.manifest.bindingSources).toContain("domain:results.offers");
    expect(result.value.manifest.bindingSources).toContain("scope:currentItem.id");
  });
});
