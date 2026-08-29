import { describe, expect, it } from "vitest";
import {
  createStudioComponentCatalog,
  resolveStudioCatalogComponent,
  validateStudioDocumentAgainstCatalog,
} from "../../packages/studio-catalog/src/index.js";
import { jsonRoundTrip } from "../helpers/index.js";

type MutableCatalogProp = {
  key: string;
  type: string;
  required: boolean;
  bindable: boolean;
  options?: string[];
};

type MutableCatalog = {
  version: string;
  id: string;
  brandId: string;
  components: Array<{
    ref: string;
    label: string;
    category: string;
    kind: string;
    props: MutableCatalogProp[];
    slots: Array<{ name: string; label: string }>;
    events: Array<{ name: string; label: string }>;
    [key: string]: unknown;
  }>;
};

type MutableDocument = {
  version: string;
  id: string;
  recipeId: string;
  entryView: string;
  views: Array<{
    id: string;
    nodes: Array<{
      id: string;
      component: string;
      order: number;
      props: Record<string, unknown>;
      parentId?: string;
      slot?: string;
    }>;
  }>;
  bindings: Array<{
    viewId: string;
    nodeId: string;
    prop: string;
    source: { kind: string; path: string };
  }>;
  interactions: Array<{
    viewId: string;
    nodeId: string;
    event: string;
    actionEvent: string;
    routes: Array<{ outcome: string; viewId: string }>;
  }>;
};

function catalog(): MutableCatalog {
  return {
    version: "1",
    id: "pegasus.studio.catalog",
    brandId: "pegasus.airlines",
    components: [
      {
        ref: "pegasus.layout.stack",
        label: "Stack",
        category: "layout.structure",
        kind: "layout",
        props: [],
        slots: [{ name: "content", label: "Content" }],
        events: [],
      },
      {
        ref: "pegasus.component.airport-picker",
        label: "Airport Picker",
        category: "travel.flight",
        kind: "input",
        props: [
          { key: "label", type: "string", required: true, bindable: false },
          { key: "value", type: "string", required: false, bindable: true },
        ],
        slots: [],
        events: [{ name: "change", label: "Change" }],
      },
      {
        ref: "pegasus.component.flight-list",
        label: "Flight List",
        category: "travel.flight",
        kind: "content",
        props: [
          { key: "items", type: "string", required: true, bindable: true },
          { key: "variant", type: "enum", required: false, bindable: false, options: ["default", "compact"] },
        ],
        slots: [],
        events: [{ name: "select", label: "Select flight" }],
      },
      {
        ref: "pegasus.component.button",
        label: "Button",
        category: "core.action",
        kind: "action",
        props: [
          { key: "label", type: "string", required: true, bindable: false },
          { key: "disabled", type: "boolean", required: false, bindable: true },
        ],
        slots: [],
        events: [{ name: "press", label: "Press" }],
      },
    ],
  };
}

function document(): MutableDocument {
  return {
    version: "1",
    id: "pegasus.cheap-flight",
    recipeId: "travel.flight.search",
    entryView: "search",
    views: [
      {
        id: "search",
        nodes: [
          { id: "root", component: "pegasus.layout.stack", order: 0, props: {} },
          { id: "origin", component: "pegasus.component.airport-picker", parentId: "root", slot: "content", order: 0, props: { label: "Nereden?" } },
          { id: "submit", component: "pegasus.component.button", parentId: "root", slot: "content", order: 1, props: { label: "Ucuz bilet bul" } },
        ],
      },
      {
        id: "results",
        nodes: [
          { id: "results-root", component: "pegasus.layout.stack", order: 0, props: {} },
          { id: "flights", component: "pegasus.component.flight-list", parentId: "results-root", slot: "content", order: 0, props: { variant: "compact" } },
        ],
      },
      {
        id: "empty",
        nodes: [{ id: "empty-root", component: "pegasus.layout.stack", order: 0, props: {} }],
      },
      {
        id: "error",
        nodes: [{ id: "error-root", component: "pegasus.layout.stack", order: 0, props: {} }],
      },
    ],
    bindings: [
      { viewId: "results", nodeId: "flights", prop: "items", source: { kind: "domain", path: "travel.flight.results" } },
      { viewId: "search", nodeId: "submit", prop: "disabled", source: { kind: "state", path: "search.disabled" } },
    ],
    interactions: [
      {
        viewId: "search",
        nodeId: "submit",
        event: "press",
        actionEvent: "flight.search.submit",
        routes: [
          { outcome: "success", viewId: "results" },
          { outcome: "empty", viewId: "empty" },
          { outcome: "error", viewId: "error" },
        ],
      },
      {
        viewId: "results",
        nodeId: "flights",
        event: "select",
        actionEvent: "flight.select",
        routes: [],
      },
    ],
  };
}

describe("studio brand component catalog", () => {
  it("normalizes a serializable brand palette without executable component implementations", () => {
    const result = createStudioComponentCatalog(catalog());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.components)).toBe(true);
    expect(jsonRoundTrip(result.value)).toEqual(result.value);
    expect(JSON.stringify(result.value)).not.toMatch(/render|callback|import|endpoint|javascript/i);
  });

  it("resolves component metadata by exact semantic reference", () => {
    expect(resolveStudioCatalogComponent(catalog(), "pegasus.component.button")).toMatchObject({
      ok: true,
      value: { label: "Button", kind: "action", events: [{ name: "press" }] },
    });
    expect(resolveStudioCatalogComponent(catalog(), "pegasus.component.unknown")).toMatchObject({
      ok: false,
      issue: { code: "UNREGISTERED_COMPONENT" },
    });
  });

  it("validates a Pegasus-style multi-view document against exact components, props, slots, bindings and events", () => {
    const result = validateStudioDocumentAgainstCatalog(document(), catalog());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe("pegasus.cheap-flight");
  });

  it("fails closed for unregistered components and invalid parent slots", () => {
    const unregistered = document();
    unregistered.views[0]!.nodes[1]!.component = "pegasus.component.secret-widget";
    expect(validateStudioDocumentAgainstCatalog(unregistered, catalog())).toMatchObject({ ok: false, issue: { code: "UNREGISTERED_COMPONENT" } });

    const invalidSlot = document();
    invalidSlot.views[0]!.nodes[1]!.slot = "footer";
    expect(validateStudioDocumentAgainstCatalog(invalidSlot, catalog())).toMatchObject({ ok: false, issue: { code: "INVALID_SLOT_TARGET" } });
  });

  it("enforces property descriptors and required values or bindings", () => {
    const badType = document();
    badType.views[0]!.nodes[2]!.props.label = 42;
    expect(validateStudioDocumentAgainstCatalog(badType, catalog())).toMatchObject({ ok: false, issue: { code: "INVALID_PROP_VALUE" } });

    const missingBinding = document();
    missingBinding.bindings = missingBinding.bindings.filter((binding) => binding.nodeId !== "flights");
    expect(validateStudioDocumentAgainstCatalog(missingBinding, catalog())).toMatchObject({ ok: false, issue: { code: "MISSING_REQUIRED_PROP" } });

    const unknownProp = document();
    unknownProp.views[0]!.nodes[2]!.props.href = "https://example.com";
    expect(validateStudioDocumentAgainstCatalog(unknownProp, catalog())).toMatchObject({ ok: false, issue: { code: "UNKNOWN_PROP" } });
  });

  it("rejects unbindable props, static/binding conflicts and undeclared component events", () => {
    const unbindable = document();
    unbindable.bindings.push({ viewId: "search", nodeId: "submit", prop: "label", source: { kind: "state", path: "search.label" } });
    expect(validateStudioDocumentAgainstCatalog(unbindable, catalog())).toMatchObject({ ok: false, issue: { code: "UNBINDABLE_PROP" } });

    const conflict = document();
    conflict.views[0]!.nodes[2]!.props.disabled = false;
    expect(validateStudioDocumentAgainstCatalog(conflict, catalog())).toMatchObject({ ok: false, issue: { code: "PROP_SOURCE_CONFLICT" } });

    const unknownEvent = document();
    unknownEvent.interactions[0]!.event = "execute";
    expect(validateStudioDocumentAgainstCatalog(unknownEvent, catalog())).toMatchObject({ ok: false, issue: { code: "UNDECLARED_EVENT" } });
  });

  it("rejects executable or implementation-bearing catalog fields and invalid enum metadata", () => {
    for (const field of ["render", "componentImpl", "import", "url", "endpoint", "callback", "javascript", "css", "html"]) {
      const input = catalog();
      input.components[0]![field] = "forbidden";
      expect(createStudioComponentCatalog(input)).toMatchObject({ ok: false, issue: { code: "INVALID_COMPONENT" } });
    }

    const invalidEnum = catalog();
    invalidEnum.components[2]!.props[1]!.options = [];
    expect(createStudioComponentCatalog(invalidEnum)).toMatchObject({ ok: false, issue: { code: "INVALID_ENUM_OPTIONS" } });
  });
});
