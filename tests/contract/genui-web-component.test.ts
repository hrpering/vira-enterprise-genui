import { describe, expect, it } from "vitest";
import type { ViraExperienceRuntime } from "../../packages/genui/src/index.js";
import { createViraGenUIElementClass } from "../../packages/genui-web-component/src/index.js";

class FakeHTMLElement {}

function createElementForContractTest() {
  const ElementClass = createViraGenUIElementClass(
    FakeHTMLElement as unknown as typeof HTMLElement,
  );
  return new ElementClass();
}

describe("GenUI web component lifecycle contract", () => {
  it("starts unmounted and dispose is idempotent", () => {
    const element = createElementForContractTest();
    expect(element.isMounted()).toBe(false);
    expect(element.isDisposed()).toBe(false);

    element.dispose();
    element.dispose();

    expect(element.isMounted()).toBe(false);
    expect(element.isDisposed()).toBe(true);
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
