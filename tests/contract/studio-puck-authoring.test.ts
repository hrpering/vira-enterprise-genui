import { describe, expect, it } from "vitest";
import { createStudioPuckAuthoringSession } from "../../packages/studio-puck-authoring/src/index.js";
import type { StudioNodeIdAllocationRequest } from "../../packages/studio-puck-authoring/src/index.js";

function catalog() {
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
        props: [{ key: "label", type: "string", required: true, bindable: false }],
        slots: [],
        events: [{ name: "change", label: "Change" }],
      },
      {
        ref: "pegasus.component.button",
        label: "Button",
        category: "core.action",
        kind: "action",
        props: [{ key: "label", type: "string", required: true, bindable: false }],
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
          { id: "submit", component: "pegasus.component.button", parentId: "root", slot: "content", order: 1, props: { label: "Ara" } },
        ],
      },
    ],
    bindings: [],
    interactions: [
      { viewId: "search", nodeId: "submit", event: "press", actionEvent: "flight.search.submit", routes: [] },
    ],
  };
}

type MutablePuckNode = {
  type: string;
  props: Record<string, unknown>;
  readOnly?: Record<string, boolean>;
};

type MutablePuckData = {
  content: MutablePuckNode[];
  root: Record<string, unknown>;
};

function mutableData(value: unknown): MutablePuckData {
  return JSON.parse(JSON.stringify(value)) as MutablePuckData;
}

describe("Studio Puck canonical authoring session", () => {
  it("reconciles visual sibling reordering into canonical Studio node order", () => {
    const session = createStudioPuckAuthoringSession({
      document: document(),
      catalog: catalog(),
      viewId: "search",
      allocateNodeId: () => "unused",
    });
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const exported = session.value.toPuckData();
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const data = mutableData(exported.value);
    const root = data.content[0];
    expect(root).toBeDefined();
    if (!root) return;
    const children = root.props.content as MutablePuckNode[];
    root.props.content = [children[1]!, children[0]!];

    const reconciled = session.value.reconcile(data);
    expect(reconciled.ok).toBe(true);
    if (!reconciled.ok) return;
    const view = reconciled.value.views[0];
    expect(view?.nodes.filter((node) => node.parentId === "root").map((node) => [node.id, node.order])).toEqual([
      ["submit", 0],
      ["origin", 1],
    ]);
  });

  it("allocates a canonical id once for a newly inserted Puck component and caches the mapping", () => {
    const requests: StudioNodeIdAllocationRequest[] = [];
    const session = createStudioPuckAuthoringSession({
      document: document(),
      catalog: catalog(),
      viewId: "search",
      allocateNodeId: (request: StudioNodeIdAllocationRequest) => {
        requests.push(request);
        return "more";
      },
    });
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const exported = session.value.toPuckData();
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const data = mutableData(exported.value);
    const root = data.content[0];
    expect(root).toBeDefined();
    if (!root) return;
    const children = root.props.content as MutablePuckNode[];
    children.push({ type: "pegasus.component.button", props: { id: "Button-1234", label: "Daha fazla" } });

    expect(session.value.reconcile(data).ok).toBe(true);
    expect(session.value.reconcile(data).ok).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toEqual({ viewId: "search", component: "pegasus.component.button", puckId: "Button-1234" });
    expect(Object.isFrozen(requests[0])).toBe(true);
    expect(session.value.currentDocument().views[0]?.nodes.some((node) => node.id === "more")).toBe(true);
  });

  it("does not commit a visual edit that leaves a canonical action reference dangling", () => {
    const session = createStudioPuckAuthoringSession({ document: document(), catalog: catalog(), viewId: "search", allocateNodeId: () => "unused" });
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const exported = session.value.toPuckData();
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const data = mutableData(exported.value);
    const root = data.content[0];
    expect(root).toBeDefined();
    if (!root) return;
    const children = root.props.content as MutablePuckNode[];
    root.props.content = children.filter((child) => child.props.id !== "submit");

    expect(session.value.reconcile(data)).toMatchObject({ ok: false, issue: { code: "IMPORT_FAILED" } });
    expect(session.value.currentDocument().interactions[0]?.nodeId).toBe("submit");
    expect(session.value.currentDocument().views[0]?.nodes.some((node) => node.id === "submit")).toBe(true);
  });

  it("contains allocator failures and rejects invalid or colliding allocated ids", () => {
    const throwing = createStudioPuckAuthoringSession({
      document: document(), catalog: catalog(), viewId: "search", allocateNodeId: () => { throw new Error("secret provider error"); },
    });
    expect(throwing.ok).toBe(true);
    if (!throwing.ok) return;
    const exported = throwing.value.toPuckData();
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const data = mutableData(exported.value);
    const root = data.content[0];
    expect(root).toBeDefined();
    if (!root) return;
    (root.props.content as MutablePuckNode[]).push({ type: "pegasus.component.button", props: { id: "Button-1234", label: "X" } });
    const failure = throwing.value.reconcile(data);
    expect(failure).toMatchObject({ ok: false, issue: { code: "ID_ALLOCATION_FAILED" } });
    if (!failure.ok) expect(failure.issue.message).not.toContain("secret provider error");

    const invalid = createStudioPuckAuthoringSession({ document: document(), catalog: catalog(), viewId: "search", allocateNodeId: () => "Not Canonical" });
    expect(invalid.ok).toBe(true);
    if (invalid.ok) expect(invalid.value.reconcile(data)).toMatchObject({ ok: false, issue: { code: "INVALID_ALLOCATED_ID" } });

    const collision = createStudioPuckAuthoringSession({ document: document(), catalog: catalog(), viewId: "search", allocateNodeId: () => "submit" });
    expect(collision.ok).toBe(true);
    if (collision.ok) expect(collision.value.reconcile(data)).toMatchObject({ ok: false, issue: { code: "ALLOCATED_ID_COLLISION" } });
  });

  it("fails before allocation for unregistered Puck components and snapshots initial canonical state", () => {
    let allocationCalls = 0;
    const source = document();
    const session = createStudioPuckAuthoringSession({
      document: source,
      catalog: catalog(),
      viewId: "search",
      allocateNodeId: () => { allocationCalls += 1; return "new-node"; },
    });
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const mutableProps = source.views[0]!.nodes[1]!.props as Record<string, string>;
    mutableProps.label = "mutated";
    expect(session.value.currentDocument().views[0]?.nodes[1]?.props.label).toBe("Nereden?");

    const exported = session.value.toPuckData();
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const data = mutableData(exported.value);
    const root = data.content[0];
    expect(root).toBeDefined();
    if (!root) return;
    (root.props.content as MutablePuckNode[]).push({ type: "pegasus.component.secret", props: { id: "Secret-1" } });
    expect(session.value.reconcile(data)).toMatchObject({ ok: false, issue: { code: "INVALID_PUCK_DATA" } });
    expect(allocationCalls).toBe(0);
  });
});
