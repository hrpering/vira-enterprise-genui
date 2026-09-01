import { describe, expect, it } from "vitest";
import { createRuntimeState } from "../../packages/runtime-core/src/index.js";
import { createStudioHostRuntimeAdapter } from "../../packages/studio-host-runtime/src/index.js";
import { prepareStudioPublication } from "../../packages/studio-publish/src/index.js";
import { createStudioRuntimeSession } from "../../packages/studio-runtime/src/index.js";

const componentCatalog = {
  version: "1",
  id: "host.once.components",
  brandId: "host.once",
  components: [{
    ref: "host.once.button",
    label: "Button",
    category: "action",
    kind: "action",
    props: [],
    slots: [],
    events: [{ name: "press", label: "Press" }],
  }],
} as const;
const bindingSourceCatalog = { version: "1", id: "host.once.data", sources: [] } as const;
const actionAdapter = {
  version: "1",
  id: "host.once.actions",
  mappings: [{ event: "submit", actionType: "host.once.submit" }],
} as const;
const document = {
  version: "1",
  id: "host.once.experience",
  recipeId: "host.once.experience",
  entryView: "main",
  views: [
    { id: "main", nodes: [{ id: "submit", component: "host.once.button", order: 0, props: {} }] },
    { id: "done", nodes: [{ id: "done", component: "host.once.button", order: 0, props: {} }] },
  ],
  bindings: [],
  interactions: [{
    viewId: "main",
    nodeId: "submit",
    event: "press",
    actionEvent: "submit",
    routes: [{ outcome: "success", viewId: "done" }],
  }],
} as const;

function runtimeState() {
  const result = createRuntimeState("host-once", {
    version: "1",
    id: "host-once-plan",
    intent: { version: "1", namespace: "host.once", name: "submit" },
    state: {},
    capabilities: { required: [], available: [], future: [] },
  });
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

function session(data: { read(source: { kind: string; path: string }): unknown }) {
  const publication = prepareStudioPublication({ document, componentCatalog, bindingSourceCatalog, actionAdapter });
  if (!publication.ok) throw new Error(publication.issue.message);
  let sequence = 0;
  const result = createStudioRuntimeSession({
    publication: publication.value,
    componentCatalog,
    bindingSourceCatalog,
    actionAdapter,
    runtimeState: runtimeState(),
    permissionPolicy: {
      version: "1",
      rules: [{ subject: "action", id: "host.once.submit", effect: "allow" }],
    },
  }, {
    data,
    actionIds: { nextId: () => `shared-action-${++sequence}` },
  });
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

describe("Studio host at-most-once forwarding", () => {
  it("shares the action-id replay guard across controllers connected to the same session", async () => {
    const actionsSeen: unknown[] = [];
    const adapter = createStudioHostRuntimeAdapter({
      version: "1",
      id: "host.once.bridge",
      snapshot: () => ({ version: "1", revision: 1, state: {}, domain: {} }),
      dispatch: async (action: unknown) => {
        actionsSeen.push(action);
        return { outcome: "success", snapshot: { version: "1", revision: 2, state: {}, domain: {} } };
      },
      subscribe: () => () => {},
    });
    expect(adapter.ok).toBe(true);
    if (!adapter.ok) return;

    const sharedSession = session(adapter.value.data);
    const firstController = adapter.value.connect(sharedSession);
    const secondController = adapter.value.connect(sharedSession);
    const dispatched = sharedSession.dispatch({ nodeId: "submit", event: "press" });
    expect(dispatched.ok).toBe(true);
    if (!dispatched.ok) return;

    const first = await firstController.forward(dispatched);
    const second = await secondController.forward(dispatched);

    expect(first.ok).toBe(true);
    expect(second).toMatchObject({ ok: false, issue: { code: "DUPLICATE_FORWARD" } });
    expect(actionsSeen).toEqual([{ type: "host.once.submit", payload: {} }]);
  });
});
