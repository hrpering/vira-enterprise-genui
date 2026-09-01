import { describe, expect, it } from "vitest";
import { createRuntimeState } from "../../packages/runtime-core/src/index.js";
import {
  createViraExperienceRuntime,
  prepareAuthoredStudioPublication,
} from "../../packages/genui/src/index.js";

function componentCatalog() {
  return {
    version: "1",
    id: "public.genui.components",
    brandId: "public.genui",
    components: [{
      ref: "public.component.button",
      label: "Button",
      category: "action",
      kind: "action",
      props: [],
      slots: [],
      events: [{ name: "press", label: "Press" }],
    }],
  };
}

function bindingSourceCatalog() {
  return { version: "1", id: "public.genui.data", sources: [] };
}

function actionAdapter() {
  return {
    version: "1",
    id: "public.genui.actions",
    mappings: [{ event: "public.submit", actionType: "public.order.submit" }],
  };
}

function document() {
  return {
    id: "public.genui.experience",
    recipeId: "public.genui.experience",
    entryView: "main",
    views: [
      { id: "main", nodes: [{ id: "submit", component: "public.component.button", order: 0, props: {} }] },
      { id: "done", nodes: [{ id: "complete", component: "public.component.button", order: 0, props: {} }] },
    ],
    interactions: [{
      viewId: "main",
      nodeId: "submit",
      event: "press",
      actionEvent: "public.submit",
      routes: [{ outcome: "success", viewId: "done" }],
    }],
  } as const;
}

function runtimeState() {
  const result = createRuntimeState("public-genui", {
    version: "1",
    id: "public-genui-plan",
    intent: { version: "1", namespace: "public.order", name: "submit" },
    state: {},
    capabilities: { required: [], available: [], future: [] },
  });
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

function publication() {
  return prepareAuthoredStudioPublication({
    document: document(),
    componentCatalog: componentCatalog(),
    bindingSourceCatalog: bindingSourceCatalog(),
    actionAdapter: actionAdapter(),
  });
}

describe("public GenUI runtime", () => {
  it("wires authored publication, React dispatch, host completion and external snapshot changes without double dispatch", async () => {
    const prepared = publication();
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    const actionsSeen: unknown[] = [];
    let hostListener: ((snapshot: unknown) => void) | undefined;
    const host = {
      version: "1",
      id: "public.genui.host",
      snapshot: () => ({ version: "1", revision: 1, state: {}, domain: {} }),
      dispatch: async (action: unknown) => {
        actionsSeen.push(action);
        return { outcome: "success", snapshot: { version: "1", revision: 2, state: {}, domain: {} } };
      },
      subscribe: (listener: (snapshot: unknown) => void) => {
        hostListener = listener;
        return () => { hostListener = undefined; };
      },
    };

    const runtime = createViraExperienceRuntime({
      publication: prepared.value,
      componentCatalog: componentCatalog(),
      bindingSourceCatalog: bindingSourceCatalog(),
      actionAdapter: actionAdapter(),
      runtimeState: runtimeState(),
      permissionPolicy: {
        version: "1",
        rules: [{ subject: "action", id: "public.order.submit", effect: "allow" }],
      },
      host,
    });
    expect(runtime.ok).toBe(true);
    if (!runtime.ok) return;
    expect("session" in runtime.value).toBe(false);
    expect("forward" in runtime.value.controller).toBe(false);
    expect("dispose" in runtime.value.controller).toBe(false);

    const observedRevisions: number[] = [];
    const unsubscribeRuntime = runtime.value.subscribe(() => {
      observedRevisions.push(runtime.value.revision());
    });

    const rejectedRevision = runtime.value.revision();
    const rejected = await runtime.value.controller.dispatch({ nodeId: "missing", event: "press" });
    expect(rejected.ok).toBe(false);
    expect(runtime.value.revision()).toBe(rejectedRevision);
    expect(observedRevisions).toEqual([]);
    expect(actionsSeen).toEqual([]);

    let resolveHost: ((value: unknown) => void) | undefined;
    const hostResult = new Promise((resolve) => { resolveHost = resolve; });
    const renderers = {
      "public.component.button": ({ nodeId, emit }: { nodeId: string; emit: (event: string, payload?: unknown) => unknown }) => {
        if (nodeId === "submit") emit("press", { sku: "SKU-1" });
        return null;
      },
    };

    const rendered = runtime.value.renderReact({
      renderers,
      onHostResult: (result) => { resolveHost?.(result); },
    });
    expect(rendered.ok).toBe(true);

    const forwarded = await hostResult;
    expect(forwarded).toMatchObject({ ok: true, value: { outcome: "success" } });
    expect(actionsSeen).toEqual([{
      type: "public.order.submit",
      payload: { sku: "SKU-1" },
    }]);
    expect(runtime.value.controller.currentViewId()).toBe("done");
    expect(runtime.value.revision()).toBeGreaterThan(0);
    expect(observedRevisions.length).toBeGreaterThan(0);

    const beforeExternalSnapshot = runtime.value.revision();
    hostListener?.({ version: "1", revision: 3, state: {}, domain: {} });
    expect(runtime.value.revision()).toBe(beforeExternalSnapshot + 1);
    expect(observedRevisions.at(-1)).toBe(runtime.value.revision());

    const observationsBeforeUnsubscribe = observedRevisions.length;
    unsubscribeRuntime();
    hostListener?.({ version: "1", revision: 4, state: {}, domain: {} });
    expect(observedRevisions).toHaveLength(observationsBeforeUnsubscribe);

    runtime.value.dispose();
    runtime.value.dispose();
    expect(hostListener).toBeUndefined();
  });

  it("isolates a throwing onHostResult consumer callback after canonical host completion", async () => {
    const prepared = publication();
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    const actionsSeen: unknown[] = [];
    const runtime = createViraExperienceRuntime({
      publication: prepared.value,
      componentCatalog: componentCatalog(),
      bindingSourceCatalog: bindingSourceCatalog(),
      actionAdapter: actionAdapter(),
      runtimeState: runtimeState(),
      permissionPolicy: {
        version: "1",
        rules: [{ subject: "action", id: "public.order.submit", effect: "allow" }],
      },
      host: {
        version: "1",
        id: "public.genui.throwing-callback-host",
        snapshot: () => ({ version: "1", revision: 1, state: {}, domain: {} }),
        dispatch: async (action: unknown) => {
          actionsSeen.push(action);
          return { outcome: "success" };
        },
        subscribe: () => () => {},
      },
    });
    expect(runtime.ok).toBe(true);
    if (!runtime.ok) return;

    const rendered = runtime.value.renderReact({
      renderers: {
        "public.component.button": ({ nodeId, emit }: { nodeId: string; emit: (event: string, payload?: unknown) => unknown }) => {
          if (nodeId === "submit") emit("press", { sku: "SKU-2" });
          return null;
        },
      },
      onHostResult: () => {
        throw new Error("consumer callback must be isolated");
      },
    });
    expect(rendered.ok).toBe(true);

    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    expect(actionsSeen).toEqual([{
      type: "public.order.submit",
      payload: { sku: "SKU-2" },
    }]);
    expect(runtime.value.controller.currentViewId()).toBe("done");

    runtime.value.dispose();
  });
});
