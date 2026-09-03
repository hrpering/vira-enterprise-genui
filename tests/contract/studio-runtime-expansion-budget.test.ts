import { describe, expect, it } from "vitest";
import { createRuntimeState } from "../../packages/runtime-core/src/index.js";
import {
  STUDIO_RUNTIME_MAX_EXPANDED_NODES,
  createStudioRuntimeSession,
} from "../../packages/studio-runtime/src/index.js";
import { prepareStudioPublication } from "../../packages/studio-publish/src/index.js";

const itemCount = 65;
const items = Array.from({ length: itemCount }, (_, index) => ({ index }));

function componentCatalog() {
  return {
    version: "1",
    id: "runtime.limit.components",
    brandId: "runtime.limit",
    components: [{
      ref: "runtime.limit.container",
      label: "Container",
      category: "content",
      kind: "content",
      props: [],
      slots: [{ name: "content", label: "Content" }],
      events: [],
    }],
  } as const;
}

function bindingSourceCatalog() {
  return {
    version: "1",
    id: "runtime.limit.data",
    sources: [{
      kind: "state",
      path: "items",
      label: "Items",
      valueType: "array",
    }],
  } as const;
}

function actionAdapter() {
  return {
    version: "1",
    id: "runtime.limit.actions",
    mappings: [{ event: "noop", actionType: "noop" }],
  } as const;
}

function publication() {
  const result = prepareStudioPublication({
    document: {
      version: "1",
      id: "runtime.limit.experience",
      recipeId: "runtime.limit.recipe",
      entryView: "main",
      views: [{
        id: "main",
        nodes: [
          {
            id: "outer",
            component: "runtime.limit.container",
            order: 0,
            props: {},
            repeat: { source: { kind: "state", path: "items" } },
          },
          {
            id: "inner",
            component: "runtime.limit.container",
            order: 1,
            props: {},
            parentId: "outer",
            slot: "content",
            repeat: { source: { kind: "state", path: "items" } },
          },
        ],
      }],
      bindings: [],
      interactions: [],
    },
    componentCatalog: componentCatalog(),
    bindingSourceCatalog: bindingSourceCatalog(),
    actionAdapter: actionAdapter(),
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

function runtimeState() {
  const result = createRuntimeState("runtime.limit.experience", {
    version: "1",
    id: "runtime.limit.plan",
    intent: { version: "1", namespace: "runtime.limit", name: "render" },
    state: {},
    capabilities: {},
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

describe("Studio runtime cumulative expansion budget", () => {
  it("fails closed before nested repeats can amplify beyond the cross-platform node budget", () => {
    expect(itemCount + itemCount * itemCount).toBeGreaterThan(STUDIO_RUNTIME_MAX_EXPANDED_NODES);

    const created = createStudioRuntimeSession({
      publication: publication(),
      componentCatalog: componentCatalog(),
      bindingSourceCatalog: bindingSourceCatalog(),
      actionAdapter: actionAdapter(),
      runtimeState: runtimeState(),
      permissionPolicy: { version: "1", rules: [] },
    }, {
      data: {
        read(source) {
          if (source.kind === "state" && source.path === "items") return items;
          throw new Error("unexpected source");
        },
      },
      actionIds: { nextId: () => "action-unused" },
    });

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.currentView()).toMatchObject({
      ok: false,
      issue: {
        code: "REPEAT_LIMIT_EXCEEDED",
        path: "$.view.nodes",
      },
    });
  });
});
