import { describe, expect, it } from "vitest";
import { createStudioPuckShellSession } from "../../packages/studio-react/src/index.js";

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
    ],
  };
}

function document(nodeId = "root") {
  return {
    version: "1",
    id: "demo.root-renderer",
    recipeId: "demo.root-renderer",
    entryView: "search",
    views: [{ id: "search", nodes: [{ id: nodeId, component: "demo.layout.stack", order: 0, props: {} }] }],
    bindings: [],
    interactions: [],
  };
}

describe("Studio React reserved Puck identity", () => {
  it("keeps active Puck aliases out of the trusted renderer context", () => {
    const nodeIds: string[] = [];
    const shell = createStudioPuckShellSession({
      document: document(),
      catalog: catalog(),
      viewId: "search",
      renderers: {
        "demo.layout.stack": (context: { nodeId: string }) => {
          nodeIds.push(context.nodeId);
          return null;
        },
      },
    });
    expect(shell.ok).toBe(true);
    if (!shell.ok) return;

    const data = shell.value.data as unknown as { content: Array<{ props: { id: string } }> };
    expect(data.content[0]?.props.id).toBe("vira~root");

    const components = shell.value.config.components as unknown as Record<string, { render: (props: Record<string, unknown>) => unknown }>;
    components["demo.layout.stack"]?.render({ id: "vira~root", content: [] });
    expect(nodeIds).toEqual(["root"]);
  });

  it("does not decode a reserved-looking Puck id that is not mapped by the active view", () => {
    const contexts: Array<{ nodeId: string; props?: Readonly<Record<string, unknown>> }> = [];
    const shell = createStudioPuckShellSession({
      document: document("canvas"),
      catalog: catalog(),
      viewId: "search",
      renderers: {
        "demo.layout.stack": (context: { nodeId: string; props?: Readonly<Record<string, unknown>> }) => {
          contexts.push(context);
          return null;
        },
      },
    });
    expect(shell.ok).toBe(true);
    if (!shell.ok) return;

    const data = shell.value.data as unknown as { content: Array<{ props: { id: string } }> };
    expect(data.content[0]?.props.id).toBe("canvas");

    const components = shell.value.config.components as unknown as Record<string, { render: (props: Record<string, unknown>) => unknown }>;
    components["demo.layout.stack"]?.render({ id: "vira~root", content: [] });
    expect(contexts[0]?.nodeId).toBe("vira~root");
    expect(contexts[0]?.props).not.toHaveProperty("id");
  });
});
