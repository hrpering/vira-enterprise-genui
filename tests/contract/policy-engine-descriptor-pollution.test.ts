import { describe, expect, it } from "vitest";
import { evaluatePolicyCheck } from "../../packages/policy-engine/src/index.js";

const TEST_DEFINE_PROPERTY = Object.defineProperty;
const TEST_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const TEST_DELETE_PROPERTY = Reflect.deleteProperty;

function restoreProperty(target: object, key: PropertyKey, previous: PropertyDescriptor | undefined): void {
  if (previous) TEST_DEFINE_PROPERTY(target, key, previous);
  else TEST_DELETE_PROPERTY(target, key);
}

describe("Policy Engine descriptor prototype hardening", () => {
  it("does not treat inherited descriptor.value as own wrapper data", () => {
    const input: Record<string, unknown> = {
      policy: { version: "1", allowed: ["tool.search"] },
      target: "tool.search",
    };
    let inputReads = 0;
    let pollutedReads = 0;
    TEST_DEFINE_PROPERTY(input, "kind", {
      configurable: true,
      enumerable: true,
      get() {
        inputReads += 1;
        return "capability";
      },
    });

    const previousValue = TEST_GET_OWN_PROPERTY_DESCRIPTOR(Object.prototype, "value");
    let result: ReturnType<typeof evaluatePolicyCheck>;
    try {
      TEST_DEFINE_PROPERTY(Object.prototype, "value", {
        configurable: true,
        get() {
          pollutedReads += 1;
          return "capability";
        },
      });
      result = evaluatePolicyCheck(input);
    } finally {
      restoreProperty(Object.prototype, "value", previousValue);
    }

    expect(inputReads).toBe(0);
    expect(pollutedReads).toBe(0);
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT", path: "$.kind" },
    });
  });
});
