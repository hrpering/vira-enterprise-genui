import { describe, expect, it } from "vitest";
import {
  createStudioPuckEditorMetadata,
  importPuckDataIntoStudioDocument,
  studioViewToPuckData,
} from "../../packages/studio-puck-adapter/src/index.js";

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
  }>;
};

type MutablePuckComponent = {
  type: string;
  props: Record<string, unknown>;
  readOnly?: Record<string, boolean>;
};

type MutablePuckData = {
  content: MutablePuckComponent[];
  root: Record<string, unknown>;
  zones?: Record<string, unknown>;
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

function document() {
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
      { id: "empty", nodes: [{ id: "empty-root", component: "pegasus.layout.stack", order: 0, props: {} }] },
      { id: "error", nodes: [{ id: "error-root", component: "pegasus.layout.stack", order: 0, props: {} }] },
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
      { viewId: "results", nodeId: "flights", event: "select", actionEvent: "flight.select", routes: [] },
    ],
  };
}

function mutableData(value: unknown): MutablePuckData {
  return JSON.parse(JSON.stringify(value)) as MutablePuckData;
}

describe("studio Puck adapter", () => {
  it("maps the Vira brand catalog to Puck 0.22.4 field and slot metadata", () => {
    const result = createStudioPuckEditorMetadata(catalog());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stack = result.value.components.find((component) => component.type === "pegasus.layout.stack");
    const button = result.value.components.find((component) => component.type === "pegasus.component.button");
    const flights = result.value.components.find((component) => component.type === "pegasus.component.flight-list");
    expect(stack?.fields.content).toEqual({ type: "slot", label: "Content" });
    expect(button?.fields.label).toEqual({ type: "text", label: "label" });
    expect(button?.fields.disabled).toMatchObject({ type: "radio", options: [{ value: true }, { value: false }] });
    expect(flights?.fields.variant).toMatchObject({ type: "select", options: [{ value: "default" }, { value: "compact" }] });
  });

  it("exports nested Studio nodes as inline Puck slot ComponentData and marks bound props read-only", () => {
    const result = studioViewToPuckData(document(), catalog(), "search");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = mutableData(result.value);
    expect(data.content).toHaveLength(1);
    expect(data.content[0]?.type).toBe("pegasus.layout.stack");
    const children = data.content[0]?.props.content as MutablePuckComponent[];
    expect(children.map((child) => child.type)).toEqual([
      "pegasus.component.airport-picker",
      "pegasus.component.button",
    ]);
    expect(children[1]?.readOnly).toEqual({ disabled: true });
    expect(data.zones).toBeUndefined();
  });

  it("round-trips one edited view without moving bindings or flow semantics into Puck data", () => {
    const exported = studioViewToPuckData(document(), catalog(), "search");
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const imported = importPuckDataIntoStudioDocument({
      document: document(),
      catalog: catalog(),
      viewId: "search",
      data: exported.value,
    });
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.value.bindings).toHaveLength(2);
    expect(imported.value.interactions).toHaveLength(2);
    expect(imported.value.interactions[0]?.actionEvent).toBe("flight.search.submit");
    expect(imported.value.views.find((view) => view.id === "search")?.nodes.map((node) => node.id)).toEqual(["root", "origin", "submit"]);
  });

  it("requires an explicit canonical mapping for Puck-generated node ids", () => {
    const exported = studioViewToPuckData(document(), catalog(), "search");
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const data = mutableData(exported.value);
    const root = data.content[0];
    expect(root).toBeDefined();
    if (!root) return;
    const children = root.props.content as MutablePuckComponent[];
    children.push({ type: "pegasus.component.button", props: { id: "Button-1234", label: "More" } });

    expect(importPuckDataIntoStudioDocument({ document: document(), catalog: catalog(), viewId: "search", data })).toMatchObject({
      ok: false,
      issue: { code: "NODE_ID_MAPPING_REQUIRED" },
    });

    const imported = importPuckDataIntoStudioDocument({
      document: document(),
      catalog: catalog(),
      viewId: "search",
      data,
      idMappings: [{ puckId: "Button-1234", nodeId: "more" }],
    });
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.value.views.find((view) => view.id === "search")?.nodes.some((node) => node.id === "more")).toBe(true);
  });

  it("rejects legacy zones, unknown Puck props, and stale id mappings", () => {
    const exported = studioViewToPuckData(document(), catalog(), "search");
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    const zones = mutableData(exported.value);
    zones.zones = { "root:content": [] };
    expect(importPuckDataIntoStudioDocument({ document: document(), catalog: catalog(), viewId: "search", data: zones })).toMatchObject({
      ok: false,
      issue: { code: "LEGACY_ZONES_UNSUPPORTED" },
    });

    const unknownProp = mutableData(exported.value);
    const children = unknownProp.content[0]?.props.content as MutablePuckComponent[];
    children[1]!.props.href = "https://example.com";
    expect(importPuckDataIntoStudioDocument({ document: document(), catalog: catalog(), viewId: "search", data: unknownProp })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_PUCK_PROP" },
    });

    expect(importPuckDataIntoStudioDocument({
      document: document(),
      catalog: catalog(),
      viewId: "search",
      data: exported.value,
      idMappings: [{ puckId: "Missing-999", nodeId: "missing" }],
    })).toMatchObject({ ok: false, issue: { code: "UNUSED_ID_MAPPING" } });
  });

  it("rejects Puck field-name collisions and edits that leave canonical bindings/actions dangling", () => {
    const collision = catalog();
    collision.components[3]!.props.push({ key: "id", type: "string", required: false, bindable: false });
    expect(createStudioPuckEditorMetadata(collision)).toMatchObject({ ok: false, issue: { code: "PUCK_FIELD_COLLISION" } });

    const exported = studioViewToPuckData(document(), catalog(), "search");
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const data = mutableData(exported.value);
    const root = data.content[0];
    expect(root).toBeDefined();
    if (!root) return;
    const children = root.props.content as MutablePuckComponent[];
    root.props.content = children.filter((child) => child.props.id !== "submit");
    expect(importPuckDataIntoStudioDocument({ document: document(), catalog: catalog(), viewId: "search", data })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_IMPORTED_DOCUMENT" },
    });
  });
});
