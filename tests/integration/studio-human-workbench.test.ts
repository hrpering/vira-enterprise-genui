import { describe, expect, it } from "vitest";
import { createStudioWorkbenchSession } from "../../packages/studio-workbench/src/index.js";

type MutablePuckNode = { type: string; props: Record<string, unknown> };
type MutablePuckData = { content: MutablePuckNode[]; root: Record<string, unknown> };

function components() {
  return {
    version: "1",
    id: "pegasus.studio.components",
    brandId: "pegasus",
    components: [
      { ref: "pegasus.layout.stack", label: "Stack", category: "layout", kind: "layout", props: [], slots: [{ name: "content", label: "Content" }], events: [] },
      { ref: "pegasus.component.button", label: "Button", category: "action", kind: "action", props: [{ key: "label", type: "string", required: true, bindable: false }], slots: [], events: [{ name: "press", label: "Press" }] },
      { ref: "pegasus.component.flight-list", label: "Flights", category: "flight", kind: "content", props: [{ key: "items", type: "string", required: true, bindable: true }], slots: [], events: [] },
    ],
  };
}

const sources = { version: "1", id: "pegasus.studio.data", sources: [{ kind: "domain", path: "travel.flight.results", label: "Flight results", valueType: "string" }] };
const actions = { version: "1", id: "pegasus.studio.actions", mappings: [{ event: "flight.search.submit", actionType: "travel.flight.search.submit" }] };

function document() {
  return {
    version: "1",
    id: "pegasus.flight-search",
    recipeId: "travel.flight.search",
    entryView: "search",
    views: [{ id: "search", nodes: [
      { id: "root", component: "pegasus.layout.stack", order: 0, props: {} },
      { id: "submit", component: "pegasus.component.button", parentId: "root", slot: "content", order: 0, props: { label: "Find flights" } },
    ] }],
    bindings: [],
    interactions: [],
  };
}

describe("Studio human workbench", () => {
  it("authors screens, Puck components, data bindings, actions and routes before publish", () => {
    const created = createStudioWorkbenchSession({
      document: document(), componentCatalog: components(), bindingSourceCatalog: sources, actionAdapter: actions,
      allocateNodeId: ({ component }) => component.endsWith("flight-list") ? "flights" : "allocated",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = created.value;

    expect(session.addView({ viewId: "results", root: { id: "root", component: "pegasus.layout.stack" } }).ok).toBe(true);
    const exported = session.toPuckData();
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const data = JSON.parse(JSON.stringify(exported.value)) as MutablePuckData;
    const root = data.content[0];
    expect(root).toBeDefined();
    if (!root) return;
    const children = root.props.content as MutablePuckNode[];
    children.push({ type: "pegasus.component.flight-list", props: { id: "FlightList-1234", items: "preview" } });
    expect(session.reconcilePuck(data).ok).toBe(true);
    expect(session.resolveNodeId("FlightList-1234")).toBe("flights");
    expect(session.setBinding({ nodeId: "flights", prop: "items", source: { kind: "domain", path: "travel.flight.results" } }).ok).toBe(true);

    expect(session.selectView("search").ok).toBe(true);
    expect(session.setAction({ nodeId: "submit", event: "press", actionEvent: "flight.search.submit" }).ok).toBe(true);
    expect(session.setRoute({ nodeId: "submit", event: "press", outcome: "success", targetViewId: "results" }).ok).toBe(true);
    expect(session.publish().ok).toBe(true);
    expect(session.removeView("results")).toMatchObject({ ok: false, issue: { code: "VIEW_REFERENCED" } });
  });

  it("fails closed for invalid screens and entry deletion", () => {
    const created = createStudioWorkbenchSession({ document: document(), componentCatalog: components(), bindingSourceCatalog: sources, actionAdapter: actions, allocateNodeId: () => "allocated" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.addView({ viewId: "Bad View", root: { id: "root", component: "pegasus.layout.stack" } })).toMatchObject({ ok: false, issue: { code: "INVALID_VIEW" } });
    expect(created.value.removeView("search")).toMatchObject({ ok: false, issue: { code: "LAST_VIEW" } });
  });
});
