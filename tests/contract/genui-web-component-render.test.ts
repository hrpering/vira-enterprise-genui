import { beforeEach, describe, expect, it } from "vitest";
import type { ViraExperienceRuntime } from "../../packages/genui/src/index.js";
import {
  createViraGenUIElementClass,
  type ViraGenUIReactRootFactory,
} from "../../packages/genui-web-component/src/index.js";

const rootState = {
  renders: [] as unknown[],
  unmounts: 0,
  failCreate: false,
};

class FakeHTMLElement {}

const rootFactory: ViraGenUIReactRootFactory = () => {
  if (rootState.failCreate) throw new Error("createRoot failed");
  return {
    render: (value: unknown) => { rootState.renders.push(value); },
    unmount: () => { rootState.unmounts += 1; },
  };
};

function createElementForContractTest() {
  const ElementClass = createViraGenUIElementClass(
    FakeHTMLElement as unknown as typeof HTMLElement,
    rootFactory,
  );
  return new ElementClass();
}

describe("GenUI web component successful render lifecycle", () => {
  beforeEach(() => {
    rootState.renders.length = 0;
    rootState.unmounts = 0;
    rootState.failCreate = false;
  });

  it("mounts, rerenders from the canonical runtime subscription and cleans up on unmount", () => {
    const element = createElementForContractTest();
    let listener: (() => void) | undefined;
    let subscriptions = 0;
    let unsubscriptions = 0;
    let runtimeRenders = 0;

    const runtime = {
      subscribe: (next: () => void) => {
        subscriptions += 1;
        listener = next;
        return () => {
          unsubscriptions += 1;
          listener = undefined;
        };
      },
      renderReact: () => {
        runtimeRenders += 1;
        return { ok: true, value: null };
      },
    } as unknown as ViraExperienceRuntime;

    expect(element.mount({ runtime, renderers: {} })).toEqual({ ok: true });
    expect(element.isMounted()).toBe(true);
    expect(subscriptions).toBe(1);
    expect(runtimeRenders).toBe(1);
    expect(rootState.renders).toHaveLength(1);

    listener?.();
    expect(runtimeRenders).toBe(2);
    expect(rootState.renders).toHaveLength(2);

    element.unmount();
    expect(element.isMounted()).toBe(false);
    expect(unsubscriptions).toBe(1);
    expect(rootState.unmounts).toBe(1);
    expect(listener).toBeUndefined();

    element.dispose();
    expect(element.isDisposed()).toBe(true);
    expect(unsubscriptions).toBe(1);
  });

  it("fails closed and cleans the runtime subscription when React root creation throws", () => {
    const element = createElementForContractTest();
    let unsubscriptions = 0;
    rootState.failCreate = true;
    const runtime = {
      subscribe: () => () => { unsubscriptions += 1; },
      renderReact: () => ({ ok: true, value: null }),
    } as unknown as ViraExperienceRuntime;

    expect(element.mount({ runtime, renderers: {} })).toEqual({
      ok: false,
      issue: { code: "RENDER_FAILED", message: "GenUI element render failed safely" },
    });
    expect(element.isMounted()).toBe(false);
    expect(unsubscriptions).toBe(1);
  });

  it("unmounts if a later runtime invalidation can no longer render safely", () => {
    const element = createElementForContractTest();
    let listener: (() => void) | undefined;
    let unsubscriptions = 0;
    let runtimeRenders = 0;
    const runtime = {
      subscribe: (next: () => void) => {
        listener = next;
        return () => {
          unsubscriptions += 1;
          listener = undefined;
        };
      },
      renderReact: () => {
        runtimeRenders += 1;
        return runtimeRenders === 1
          ? { ok: true, value: null }
          : { ok: false, issue: { message: "runtime view rejected" } };
      },
    } as unknown as ViraExperienceRuntime;

    expect(element.mount({ runtime, renderers: {} })).toEqual({ ok: true });
    expect(element.isMounted()).toBe(true);

    listener?.();
    expect(element.isMounted()).toBe(false);
    expect(unsubscriptions).toBe(1);
    expect(rootState.unmounts).toBe(1);
    expect(listener).toBeUndefined();
  });
});
