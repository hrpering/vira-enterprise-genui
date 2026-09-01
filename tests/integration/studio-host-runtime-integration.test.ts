import { describe, expect, it } from "vitest";
import { createRuntimeState } from "../../packages/runtime-core/src/index.js";
import { prepareStudioPublication } from "../../packages/studio-publish/src/index.js";
import { createStudioRuntimeSession } from "../../packages/studio-runtime/src/index.js";
import { createStudioHostRuntimeAdapter } from "../../packages/studio-host-runtime/src/index.js";

function components() {
  return {
    version: "1",
    id: "demo.host.components",
    brandId: "demo.host",
    components: [{
      ref: "demo.component.button",
      label: "Button",
      category: "action",
      kind: "action",
      props: [],
      slots: [],
      events: [{ name: "press", label: "Press" }],
    }],
  };
}
function sources() { return { version: "1", id: "demo.host.data", sources: [] }; }
function actions() { return { version: "1", id: "demo.host.actions", mappings: [{ event: "submit", actionType: "demo.order.submit" }] }; }
function document() {
  return {
    version: "1",
    id: "demo.hosted",
    recipeId: "demo.hosted",
    entryView: "main",
    views: [
      { id: "main", nodes: [{ id: "submit", component: "demo.component.button", order: 0, props: {} }] },
      { id: "success", nodes: [{ id: "done", component: "demo.component.button", order: 0, props: {} }] },
      { id: "empty", nodes: [{ id: "none", component: "demo.component.button", order: 0, props: {} }] },
      { id: "error", nodes: [{ id: "failed", component: "demo.component.button", order: 0, props: {} }] },
    ],
    bindings: [],
    interactions: [{
      viewId: "main",
      nodeId: "submit",
      event: "press",
      actionEvent: "submit",
      routes: [
        { outcome: "success", viewId: "success" },
        { outcome: "empty", viewId: "empty" },
        { outcome: "error", viewId: "error" },
      ],
    }],
  };
}
function runtimeState() {
  const result = createRuntimeState("demo-hosted", {
    version: "1",
    id: "demo-hosted-plan",
    intent: { version: "1", namespace: "demo.order", name: "submit" },
    state: {},
    capabilities: { required: [], available: [], future: [] },
  });
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}
function publication() {
  const result = prepareStudioPublication({ document: document(), componentCatalog: components(), bindingSourceCatalog: sources(), actionAdapter: actions() });
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}
function runtime(data: { read(source: { kind: string; path: string }): unknown }) {
  let sequence = 0;
  const result = createStudioRuntimeSession({
    publication: publication(),
    componentCatalog: components(),
    bindingSourceCatalog: sources(),
    actionAdapter: actions(),
    runtimeState: runtimeState(),
    permissionPolicy: { version: "1", rules: [{ subject: "action", id: "demo.order.submit", effect: "allow" }] },
  }, { data, actionIds: { nextId: () => `host-action-${++sequence}` } });
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

function host(outcome: "success" | "empty" | "error" = "success") {
  let listener: ((snapshot: unknown) => void) | undefined;
  const actionsSeen: unknown[] = [];
  const bridge = {
    version: "1",
    id: "vira.demo.host",
    snapshot: () => ({ version: "1", revision: 1, state: { cart: { count: 1 } }, domain: { product: { price: 79 } } }),
    dispatch: async (action: unknown) => {
      actionsSeen.push(action);
      return { outcome, snapshot: { version: "1", revision: 2, state: { cart: { count: 2 } }, domain: { product: { price: 79 } } } };
    },
    subscribe: (next: (snapshot: unknown) => void) => { listener = next; return () => { listener = undefined; }; },
  };
  return { bridge, actionsSeen, emit: (snapshot: unknown) => listener?.(snapshot) };
}

describe("Studio host/runtime integration", () => {
  it("uses one host snapshot for state/domain reads and publishes only forward revision changes", () => {
    const fixture = host();
    const adapter = createStudioHostRuntimeAdapter(fixture.bridge);
    expect(adapter.ok).toBe(true);
    if (!adapter.ok) return;
    expect(adapter.value.data.read({ kind: "domain", path: "product.price" })).toBe(79);
    expect(adapter.value.data.read({ kind: "state", path: "cart.count" })).toBe(1);

    const revisions: number[] = [];
    const unsubscribe = adapter.value.subscribe((snapshot) => { revisions.push(snapshot.revision); });
    fixture.emit({ version: "1", revision: 3, state: { cart: { count: 4 } }, domain: { product: { price: 82 } } });
    expect(adapter.value.data.read({ kind: "domain", path: "product.price" })).toBe(82);
    expect(adapter.value.snapshot().revision).toBe(3);
    expect(revisions).toEqual([3]);

    fixture.emit({ version: "1", revision: 3, state: { cart: { count: 999 } }, domain: { product: { price: 999 } } });
    expect(adapter.value.data.read({ kind: "domain", path: "product.price" })).toBe(82);
    expect(adapter.value.data.read({ kind: "state", path: "cart.count" })).toBe(4);
    expect(revisions).toEqual([3]);

    unsubscribe();
    fixture.emit({ version: "1", revision: 4, state: { cart: { count: 5 } }, domain: { product: { price: 84 } } });
    expect(revisions).toEqual([3]);
    expect(adapter.value.snapshot().revision).toBe(4);
    expect(adapter.value.data.read({ kind: "domain", path: "product.price" })).toBe(84);
  });

  it.each(["success", "empty", "error"] as const)("correlates %s host outcomes to declared Studio routes", async (outcome) => {
    const fixture = host(outcome);
    const adapter = createStudioHostRuntimeAdapter(fixture.bridge);
    expect(adapter.ok).toBe(true);
    if (!adapter.ok) return;
    const session = runtime(adapter.value.data);
    const controller = adapter.value.connect(session);
    const result = await controller.dispatch({ nodeId: "submit", event: "press", payload: { sku: "SKU-1" } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.outcome).toBe(outcome);
    expect(controller.currentViewId()).toBe(outcome);
    expect(fixture.actionsSeen).toEqual([{ type: "demo.order.submit", payload: { sku: "SKU-1" } }]);
  });

  it("forwards one canonical runtime action id to the host at most once", async () => {
    const fixture = host();
    const adapter = createStudioHostRuntimeAdapter(fixture.bridge);
    expect(adapter.ok).toBe(true);
    if (!adapter.ok) return;

    const session = runtime(adapter.value.data);
    const controller = adapter.value.connect(session);
    const dispatched = session.dispatch({ nodeId: "submit", event: "press", payload: { sku: "SKU-ONCE" } });
    expect(dispatched.ok).toBe(true);
    if (!dispatched.ok) return;

    const first = await controller.forward(dispatched);
    const second = await controller.forward(dispatched);

    expect(first.ok).toBe(true);
    expect(second).toMatchObject({ ok: false, issue: { code: "DUPLICATE_FORWARD" } });
    expect(fixture.actionsSeen).toEqual([{ type: "demo.order.submit", payload: { sku: "SKU-ONCE" } }]);
  });

  it("does not replay an uncertain host transport failure for the same action id", async () => {
    const fixture = host();
    let hostAttempts = 0;
    fixture.bridge.dispatch = async () => {
      hostAttempts += 1;
      throw new Error("transport failed after side-effect status became unknown");
    };
    const adapter = createStudioHostRuntimeAdapter(fixture.bridge);
    expect(adapter.ok).toBe(true);
    if (!adapter.ok) return;

    const session = runtime(adapter.value.data);
    const controller = adapter.value.connect(session);
    const dispatched = session.dispatch({ nodeId: "submit", event: "press" });
    expect(dispatched.ok).toBe(true);
    if (!dispatched.ok) return;

    const first = await controller.forward(dispatched);
    const second = await controller.forward(dispatched);

    expect(first).toMatchObject({ ok: false, issue: { code: "HOST_DISPATCH_FAILED" } });
    expect(second).toMatchObject({ ok: false, issue: { code: "DUPLICATE_FORWARD" } });
    expect(hostAttempts).toBe(1);
    expect(controller.currentViewId()).toBe("error");
  });

  it("keeps a subscription revision fault sticky and ignores later snapshots", () => {
    const fixture = host();
    const adapter = createStudioHostRuntimeAdapter(fixture.bridge);
    expect(adapter.ok).toBe(true);
    if (!adapter.ok) return;

    fixture.emit({ version: "1", revision: 2, state: { cart: { count: 2 } }, domain: { product: { price: 80 } } });
    fixture.emit({ version: "1", revision: 1, state: {}, domain: {} });
    fixture.emit({ version: "1", revision: 3, state: { cart: { count: 3 } }, domain: { product: { price: 999 } } });

    expect(adapter.value.snapshot().revision).toBe(2);
    expect(() => adapter.value.data.read({ kind: "domain", path: "product.price" })).toThrow(/moved backwards/);
  });

  it("ignores a late host result after the controller is disposed", async () => {
    let resolveHost: ((value: unknown) => void) | undefined;
    const pendingHostResult = new Promise<unknown>((resolve) => { resolveHost = resolve; });
    const adapter = createStudioHostRuntimeAdapter({
      version: "1",
      id: "vira.demo.delayed-host",
      snapshot: () => ({ version: "1", revision: 1, state: {}, domain: {} }),
      dispatch: () => pendingHostResult,
      subscribe: () => () => {},
    });
    expect(adapter.ok).toBe(true);
    if (!adapter.ok) return;

    const controller = adapter.value.connect(runtime(adapter.value.data));
    const pending = controller.dispatch({ nodeId: "submit", event: "press" });
    controller.dispose();
    resolveHost?.({
      outcome: "success",
      snapshot: { version: "1", revision: 9, state: {}, domain: { product: { price: 999 } } },
    });

    const result = await pending;
    expect(result).toMatchObject({ ok: false, issue: { code: "DISPOSED" } });
    expect(adapter.value.snapshot().revision).toBe(1);
  });

  it("routes host transport failures to the canonical error outcome without leaving an action pending", async () => {
    const fixture = host();
    fixture.bridge.dispatch = async () => { throw new Error("network detail must not escape"); };
    const adapter = createStudioHostRuntimeAdapter(fixture.bridge);
    expect(adapter.ok).toBe(true);
    if (!adapter.ok) return;
    const controller = adapter.value.connect(runtime(adapter.value.data));
    const result = await controller.dispatch({ nodeId: "submit", event: "press" });
    expect(result).toMatchObject({ ok: false, issue: { code: "HOST_DISPATCH_FAILED" } });
    expect(controller.currentViewId()).toBe("error");
  });
});
