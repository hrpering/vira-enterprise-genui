import { describe, expect, it } from "vitest";
import { isSemanticSegment } from "../../packages/protocol/src/index.js";
import {
  createStudioPuckReservedIdMappings,
  importPuckDataIntoStudioDocument,
  studioNodeIdToPuckId,
  studioViewToPuckData,
} from "../../packages/studio-puck-adapter/src/index.js";
import { createStudioPuckAuthoringSession } from "../../packages/studio-puck-authoring/src/index.js";

function catalog() {
  return {
    version: "1",
    id: "demo.studio.catalog",
    brandId: "demo.brand",
    components: [
      {
        ref: "demo.layout.stack",
        label: "Stack",
        category: "layout.structure",
        kind: "layout",
        props: [],
        slots: [{ name: "content", label: "Content" }],
        events: [],
      },
      {
        ref: "demo.component.text",
        label: "Text",
        category: "core.content",
        kind: "content",
        props: [{ key: "text", type: "string", required: true, bindable: false }],
        slots: [],
        events: [],
      },
    ],
  };
}

function document() {
  return {
    version: "1",
    id: "demo.root-collision",
    recipeId: "demo.root-collision",
    entryView: "search",
    views: [
      {
        id: "search",
        nodes: [
          { id: "root", component: "demo.layout.stack", order: 0, props: {} },
          { id: "copy", component: "demo.component.text", parentId: "root", slot: "content", order: 0, props: { text: "Hello" } },
        ],
      },
    ],
    bindings: [],
    interactions: [],
  };
}

function documentWithoutReservedRoot() {
  return {
    version: "1",
    id: "demo.no-root-collision",
    recipeId: "demo.no-root-collision",
    entryView: "search",
    views: [{ id: "search", nodes: [{ id: "shell", component: "demo.layout.stack", order: 0, props: {} }] }],
    bindings: [],
    interactions: [],
  };
}

function nestedRootDocument() {
  return {
    version: "1",
    id: "demo.nested-root-collision",
    recipeId: "demo.nested-root-collision",
    entryView: "search",
    views: [
      {
        id: "search",
        nodes: [
          { id: "shell", component: "demo.layout.stack", order: 0, props: {} },
          { id: "root", component: "demo.layout.stack", parentId: "shell", slot: "content", order: 0, props: {} },
          { id: "copy", component: "demo.component.text", parentId: "root", slot: "content", order: 0, props: { text: "Nested" } },
        ],
      },
    ],
    bindings: [],
    interactions: [],
  };
}

type MutablePuckNode = {
  type: string;
  props: Record<string, unknown>;
};

type MutablePuckData = {
  content: MutablePuckNode[];
  root: Record<string, unknown>;
};

function mutableData(value: unknown): MutablePuckData {
  return JSON.parse(JSON.stringify(value)) as MutablePuckData;
}

describe("Studio/Puck reserved identity boundary", () => {
  it("aliases canonical root only at the Puck boundary and restores it on import", () => {
    expect(studioNodeIdToPuckId("root")).toBe("vira~root");
    expect(isSemanticSegment(studioNodeIdToPuckId("root"))).toBe(false);
    expect(studioNodeIdToPuckId("copy")).toBe("copy");
    expect(createStudioPuckReservedIdMappings(["root", "copy"])).toEqual([
      { puckId: "vira~root", nodeId: "root" },
    ]);

    const exported = studioViewToPuckData(document(), catalog(), "search");
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const data = mutableData(exported.value);
    expect(data.content[0]?.props.id).toBe("vira~root");
    const children = data.content[0]?.props.content as MutablePuckNode[];
    expect(children[0]?.props.id).toBe("copy");

    const imported = importPuckDataIntoStudioDocument({
      document: document(),
      catalog: catalog(),
      viewId: "search",
      data,
    });
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.value.views[0]?.nodes.map((node) => [node.id, node.parentId])).toEqual([
      ["root", undefined],
      ["copy", "root"],
    ]);
  });

  it("recursively isolates a nested canonical root and restores its parent graph", () => {
    const exported = studioViewToPuckData(nestedRootDocument(), catalog(), "search");
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const data = mutableData(exported.value);

    expect(data.content[0]?.props.id).toBe("shell");
    const shellChildren = data.content[0]?.props.content as MutablePuckNode[];
    expect(shellChildren[0]?.props.id).toBe("vira~root");
    const rootChildren = shellChildren[0]?.props.content as MutablePuckNode[];
    expect(rootChildren[0]?.props.id).toBe("copy");

    const imported = importPuckDataIntoStudioDocument({
      document: nestedRootDocument(),
      catalog: catalog(),
      viewId: "search",
      data,
    });
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.value.views[0]?.nodes.map((node) => [node.id, node.parentId])).toEqual([
      ["shell", undefined],
      ["root", "shell"],
      ["copy", "root"],
    ]);
  });

  it("rejects a host mapping that conflicts with the reserved root identity", () => {
    const exported = studioViewToPuckData(document(), catalog(), "search");
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    expect(importPuckDataIntoStudioDocument({
      document: document(),
      catalog: catalog(),
      viewId: "search",
      data: exported.value,
      idMappings: [{ puckId: "vira~root", nodeId: "different-root" }],
    })).toMatchObject({
      ok: false,
      issue: { code: "DUPLICATE_ID_MAPPING" },
    });
  });

  it("rejects allocating a Puck-reserved canonical id to a newly generated Puck node", () => {
    const session = createStudioPuckAuthoringSession({
      document: documentWithoutReservedRoot(),
      catalog: catalog(),
      viewId: "search",
      allocateNodeId: () => "root",
    });
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const exported = session.value.toPuckData();
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const data = mutableData(exported.value);
    const shell = data.content[0];
    expect(shell).toBeDefined();
    if (!shell) return;
    const children = shell.props.content as MutablePuckNode[];
    children.push({ type: "demo.component.text", props: { id: "Text-123", text: "Inserted" } });

    expect(session.value.reconcile(data)).toMatchObject({
      ok: false,
      issue: { code: "ALLOCATED_ID_COLLISION" },
    });
    expect(session.value.currentDocument().views[0]?.nodes.map((node) => node.id)).toEqual(["shell"]);
  });

  it("seeds bidirectional authoring identity without calling the host allocator", () => {
    let allocationCalls = 0;
    const session = createStudioPuckAuthoringSession({
      document: document(),
      catalog: catalog(),
      viewId: "search",
      allocateNodeId: () => {
        allocationCalls += 1;
        return "allocated";
      },
    });
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const exported = session.value.toPuckData();
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const data = mutableData(exported.value);
    expect(data.content[0]?.props.id).toBe("vira~root");
    expect(session.value.resolveNodeId("vira~root")).toBe("root");
    expect(session.value.resolvePuckId("root")).toBe("vira~root");
    expect(session.value.resolveNodeId("copy")).toBe("copy");
    expect(session.value.resolvePuckId("copy")).toBe("copy");

    const reconciled = session.value.reconcile(data);
    expect(reconciled.ok).toBe(true);
    expect(allocationCalls).toBe(0);
    expect(session.value.currentDocument().views[0]?.nodes.map((node) => node.id)).toEqual(["root", "copy"]);
  });

  it("contains revoked Proxy reflection at public import and authoring boundaries", () => {
    const first = Proxy.revocable({ content: [], root: { props: {} } }, {});
    first.revoke();
    expect(importPuckDataIntoStudioDocument({
      document: document(),
      catalog: catalog(),
      viewId: "search",
      data: first.proxy,
    })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_PUCK_DATA", path: "$.data" },
    });

    const session = createStudioPuckAuthoringSession({
      document: document(),
      catalog: catalog(),
      viewId: "search",
      allocateNodeId: () => "allocated",
    });
    expect(session.ok).toBe(true);
    if (!session.ok) return;

    const second = Proxy.revocable({ content: [], root: { props: {} } }, {});
    second.revoke();
    expect(session.value.reconcile(second.proxy as never)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_PUCK_DATA", path: "$.data" },
    });
  });

  it("never invokes accessor-backed Puck content while rejecting it", () => {
    let reads = 0;
    const data = {
      root: { props: {} },
      get content(): never {
        reads += 1;
        throw new Error("accessor must not run");
      },
    };

    expect(importPuckDataIntoStudioDocument({
      document: document(),
      catalog: catalog(),
      viewId: "search",
      data,
    })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_PUCK_DATA" },
    });

    const session = createStudioPuckAuthoringSession({
      document: document(),
      catalog: catalog(),
      viewId: "search",
      allocateNodeId: () => "allocated",
    });
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    expect(session.value.reconcile(data as never)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_PUCK_DATA" },
    });
    expect(reads).toBe(0);
  });
});
