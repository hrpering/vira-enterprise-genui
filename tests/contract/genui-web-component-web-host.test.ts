import { beforeEach, describe, expect, it } from "vitest";
import type { ViraWebExperience } from "../../packages/genui/src/index.js";
import {
  createViraGenUIElementClass,
  type ViraGenUIReactRootFactory,
} from "../../packages/genui-web-component/src/index.js";

class FakeHTMLElement {}

const rootState = {
  renders: [] as unknown[],
  unmounts: 0,
};

const rootFactory: ViraGenUIReactRootFactory = () => ({
  render: (node) => { rootState.renders.push(node); },
  unmount: () => { rootState.unmounts += 1; },
});

function createElement() {
  const ElementClass = createViraGenUIElementClass(
    FakeHTMLElement as unknown as typeof HTMLElement,
    rootFactory,
  );
  return new ElementClass();
}

describe("MASTER-07A GenUI Web Component bound Web Host mode", () => {
  beforeEach(() => {
    rootState.renders.length = 0;
    rootState.unmounts = 0;
  });

  it("mounts a renderer-bound ViraWebExperience without accepting a second renderer registry", () => {
    const element = createElement();
    let listener: (() => void) | undefined;
    let renders = 0;
    let unsubscriptions = 0;
    const webExperience = {
      subscribe(next: () => void) {
        listener = next;
        return () => {
          unsubscriptions += 1;
          listener = undefined;
        };
      },
      renderReact() {
        renders += 1;
        return { ok: true as const, value: null };
      },
    } as unknown as ViraWebExperience;

    expect(element.mount({ webExperience })).toEqual({ ok: true });
    expect(element.isMounted()).toBe(true);
    expect(renders).toBe(1);
    expect(rootState.renders).toHaveLength(1);

    listener?.();
    expect(renders).toBe(2);
    expect(rootState.renders).toHaveLength(2);

    element.unmount();
    expect(element.isMounted()).toBe(false);
    expect(unsubscriptions).toBe(1);
    expect(rootState.unmounts).toBe(1);
  });

  it("cleans the Web Experience subscription when a later bound render fails", () => {
    const element = createElement();
    let listener: (() => void) | undefined;
    let renders = 0;
    let unsubscriptions = 0;
    const webExperience = {
      subscribe(next: () => void) {
        listener = next;
        return () => {
          unsubscriptions += 1;
          listener = undefined;
        };
      },
      renderReact() {
        renders += 1;
        return renders === 1
          ? { ok: true as const, value: null }
          : { ok: false as const, issue: { code: "RENDERER_FAILED", path: "$.renderers", message: "bound render rejected" } };
      },
    } as unknown as ViraWebExperience;

    expect(element.mount({ webExperience })).toEqual({ ok: true });
    listener?.();

    expect(element.isMounted()).toBe(false);
    expect(unsubscriptions).toBe(1);
    expect(rootState.unmounts).toBe(1);
    expect(listener).toBeUndefined();
  });
});
