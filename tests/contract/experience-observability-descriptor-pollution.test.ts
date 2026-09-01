import { describe, expect, it } from "vitest";
import { createExperienceObservation } from "../../packages/experience-observability/src/index.js";

const TEST_DEFINE_PROPERTY = Object.defineProperty;
const TEST_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const TEST_DELETE_PROPERTY = Reflect.deleteProperty;
const occurredAt = "2026-09-01T02:30:00.000Z";

function restoreProperty(target: object, key: PropertyKey, previous: PropertyDescriptor | undefined): void {
  if (previous) TEST_DEFINE_PROPERTY(target, key, previous);
  else TEST_DELETE_PROPERTY(target, key);
}

describe("Experience Observability descriptor prototype hardening", () => {
  it("does not treat inherited descriptor.value as own wrapper data", () => {
    const input: Record<string, unknown> = {
      source: "host",
      occurredAt,
    };
    let inputReads = 0;
    let pollutedReads = 0;
    TEST_DEFINE_PROPERTY(input, "name", {
      configurable: true,
      enumerable: true,
      get() {
        inputReads += 1;
        return "experience.requested";
      },
    });

    const previousValue = TEST_GET_OWN_PROPERTY_DESCRIPTOR(Object.prototype, "value");
    let result: ReturnType<typeof createExperienceObservation>;
    try {
      TEST_DEFINE_PROPERTY(Object.prototype, "value", {
        configurable: true,
        get() {
          pollutedReads += 1;
          return "experience.requested";
        },
      });
      result = createExperienceObservation(input);
    } finally {
      restoreProperty(Object.prototype, "value", previousValue);
    }

    expect(inputReads).toBe(0);
    expect(pollutedReads).toBe(0);
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT", path: "$.name" },
    });
  });
});
