import { describe, expect, it } from "vitest";
import { resolveStudioPaletteInsertionTarget } from "../../packages/studio-workbench-react/src/palette.js";
import type { StudioNode } from "../../packages/studio-schema/src/types.js";

const components = [
  { ref: "demo.layout.stack", slots: [{ name: "content" }] },
  { ref: "demo.component.text", slots: [] },
  { ref: "demo.component.button", slots: [] },
] as const;

function node(input: Omit<StudioNode, "props">): StudioNode {
  return { ...input, props: {} };
}

describe("Studio React component palette", () => {
  it("inserts into the first slot of a selected layout", () => {
    const nodes = [
      node({ id: "root", component: "demo.layout.stack", order: 0 }),
      node({ id: "one", component: "demo.component.text", parentId: "root", slot: "content", order: 0 }),
      node({ id: "two", component: "demo.component.button", parentId: "root", slot: "content", order: 1 }),
    ];

    expect(resolveStudioPaletteInsertionTarget({ nodes, components, selectedId: "root" })).toEqual({
      zone: "root:content",
      index: 2,
      parentId: "root",
      slot: "content",
    });
  });

  it("inserts after a selected leaf in its current slot", () => {
    const nodes = [
      node({ id: "root", component: "demo.layout.stack", order: 0 }),
      node({ id: "one", component: "demo.component.text", parentId: "root", slot: "content", order: 0 }),
      node({ id: "two", component: "demo.component.button", parentId: "root", slot: "content", order: 1 }),
    ];

    expect(resolveStudioPaletteInsertionTarget({ nodes, components, selectedId: "one" })).toEqual({
      zone: "root:content",
      index: 1,
      parentId: "root",
      slot: "content",
    });
  });

  it("defaults to the first root layout slot when nothing is selected", () => {
    const nodes = [
      node({ id: "root", component: "demo.layout.stack", order: 0 }),
      node({ id: "one", component: "demo.component.text", parentId: "root", slot: "content", order: 0 }),
    ];

    expect(resolveStudioPaletteInsertionTarget({ nodes, components })).toEqual({
      zone: "root:content",
      index: 1,
      parentId: "root",
      slot: "content",
    });
  });

  it("falls back to Puck's root zone when no root layout slot exists", () => {
    const nodes = [
      node({ id: "one", component: "demo.component.text", order: 0 }),
      node({ id: "two", component: "demo.component.button", order: 1 }),
    ];

    expect(resolveStudioPaletteInsertionTarget({ nodes, components })).toEqual({
      zone: "root:default-zone",
      index: 2,
    });
  });
});
