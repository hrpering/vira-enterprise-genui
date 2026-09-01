import { describe, expect, it } from "vitest";
import { normalizeProtocolGatewayResult } from "../../packages/protocol-gateway/src/index.js";

const TEST_DEFINE_PROPERTY = Object.defineProperty;
const TEST_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const TEST_DELETE_PROPERTY = Reflect.deleteProperty;

function restoreProperty(target: object, key: PropertyKey, previous: PropertyDescriptor | undefined): void {
  if (previous) TEST_DEFINE_PROPERTY(target, key, previous);
  else TEST_DELETE_PROPERTY(target, key);
}

describe("Protocol Gateway descriptor prototype hardening", () => {
  it("does not treat inherited descriptor.value as own wrapper data", () => {
    const input: Record<string, unknown> = {
      toolName: "search.web",
      payload: { content: [{ type: "text", text: "ok" }] },
    };
    let inputReads = 0;
    let pollutedReads = 0;
    TEST_DEFINE_PROPERTY(input, "protocol", {
      configurable: true,
      enumerable: true,
      get() {
        inputReads += 1;
        return "mcp";
      },
    });

    const previousValue = TEST_GET_OWN_PROPERTY_DESCRIPTOR(Object.prototype, "value");
    let result: ReturnType<typeof normalizeProtocolGatewayResult>;
    try {
      TEST_DEFINE_PROPERTY(Object.prototype, "value", {
        configurable: true,
        get() {
          pollutedReads += 1;
          return "mcp";
        },
      });
      result = normalizeProtocolGatewayResult(input);
    } finally {
      restoreProperty(Object.prototype, "value", previousValue);
    }

    expect(inputReads).toBe(0);
    expect(pollutedReads).toBe(0);
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT", path: "$.protocol" },
    });
  });
});
