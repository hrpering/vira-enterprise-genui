import { afterEach, describe, expect, it, vi } from "vitest";
import type { ViraExperienceRuntime } from "../../packages/genui/src/index.js";
import {
  VIRA_GENUI_EXPERIENCE_TAG_NAME,
  createViraGenUIElementClass,
  defineViraGenUIElement,
} from "../../packages/genui-web-component/src/index.js";

class FakeHTMLElement {}

afterEach(() => {
  vi.unstubAllGlobals();
});

function createElementForContractTest() {
  const ElementClass = createViraGenUIElementClass(
    FakeHTMLElement as unknown as typeof HTMLElement,
  );
  return new ElementClass();
}

describe("GenUI web component lifecycle contract", () => {
  it("fails closed instead of reading missing browser globals during SSR", () => {
    vi.stubGlobal("HTMLElement", undefined);
    vi.stubGlobal("customElements", undefined);

    expect(defineViraGenUIElement()).toEqual({
      ok: false,
      issue: {
        code: "PLATFORM_UNAVAILABLE",
        message: "GenUI custom elements platform is unavailable",
      },
    });
  });

  it("registers once through an explicit platform and rejects duplicate ownership", () => {
    const definitions = new Map<string, CustomElementConstructor>();
    const platform = {
      HTMLElementBase: FakeHTMLElement as unknown as typeof HTMLElement,
      registry: {
        get: (name: string) => definitions.get(name),
        define: (name: string, constructor: CustomElementConstructor) => {
          definitions.set(name, constructor);
        },
      },
    };

    const first = defineViraGenUIElement(platform);
    expect(first.ok).toBe(true);
    expect(definitions.has(VIRA_GENUI_EXPERIENCE_TAG_NAME)).toBe(true);

    expect(defineViraGenUIElement(platform)).toEqual({
      ok: false,
      issue: {
        code: "ALREADY_DEFINED",
        message: `${VIRA_GENUI_EXPERIENCE_TAG_NAME} is already defined`,
      },
    });
  });

  it("starts unmounted and dispose is idempotent", () => {
    const element = createElementForContractTest();
    expect(element.isMounted()).toBe(false);
    expect(element.isDisposed()).toBe(false);

    element.dispose();
    element.dispose();

    expect(element.isMounted()).toBe(false);
    expect(element.isDisposed()).toBe(true);
  });

  it("cleans the runtime subscription when the initial render fails", () => {
    const element = createElementForContractTest();
    let subscriptions = 0;
    let unsubscriptions = 0;
    const runtime = {
      subscribe: () => {
        subscriptions += 1;
        return () => { unsubscriptions += 1; };
      },
      renderReact: () => ({
        ok: false,
        issue: { message: "blocked by canonical runtime" },
      }),
    } as unknown as ViraExperienceRuntime;

    const result = element.mount({ runtime, renderers: {} });

    expect(result).toEqual({
      ok: false,
      issue: {
        code: "RENDER_FAILED",
        message: "blocked by canonical runtime",
      },
    });
    expect(subscriptions).toBe(1);
    expect(unsubscriptions).toBe(1);
    expect(element.isMounted()).toBe(false);
  });

  it("fails closed when mount is attempted after disposal", () => {
    const element = createElementForContractTest();
    element.dispose();

    const result = element.mount({
      runtime: {} as unknown as ViraExperienceRuntime,
      renderers: {},
    });

    expect(result).toEqual({
      ok: false,
      issue: {
        code: "DISPOSED",
        message: "GenUI element is disposed",
      },
    });
    expect(element.isMounted()).toBe(false);
  });
});
