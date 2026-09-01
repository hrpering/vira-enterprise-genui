import { describe, expect, it } from "vitest";
import { parseExperiencePackManifest } from "../../packages/experience-packs/src/index.js";

const TEST_DEFINE_PROPERTY = Object.defineProperty;
const TEST_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const TEST_DELETE_PROPERTY = Reflect.deleteProperty;
const digest = `sha256:${"b".repeat(64)}`;

function restoreProperty(target: object, key: PropertyKey, previous: PropertyDescriptor | undefined): void {
  if (previous) {
    TEST_DEFINE_PROPERTY(target, key, previous);
  } else {
    TEST_DELETE_PROPERTY(target, key);
  }
}

function manifest() {
  return {
    schemaVersion: "1",
    id: "vira/descriptor-proof",
    version: "1.0.0",
    publisher: { id: "vira", name: "Vira" },
    metadata: { name: "Descriptor Proof", tags: ["utility"] },
    compatibility: { minViraVersion: "0.0.0" },
    entrypoints: ["main"],
    artifacts: [{
      id: "main",
      role: "studio-publication",
      mediaType: "application/json",
      digest,
      size: 1,
    }],
  };
}

describe("Experience Pack descriptor prototype-pollution hardening", () => {
  it("does not treat inherited descriptor.value as an own data descriptor", () => {
    const input = manifest();
    let inputGetterReads = 0;
    let pollutedValueReads = 0;
    TEST_DEFINE_PROPERTY(input.publisher, "name", {
      configurable: true,
      enumerable: true,
      get() {
        inputGetterReads += 1;
        return "Vira";
      },
    });

    const previousValue = TEST_GET_OWN_PROPERTY_DESCRIPTOR(Object.prototype, "value");
    let result: ReturnType<typeof parseExperiencePackManifest>;
    try {
      TEST_DEFINE_PROPERTY(Object.prototype, "value", {
        configurable: true,
        get() {
          pollutedValueReads += 1;
          return "Vira";
        },
      });
      result = parseExperiencePackManifest(input);
    } finally {
      restoreProperty(Object.prototype, "value", previousValue);
    }

    expect(inputGetterReads).toBe(0);
    expect(pollutedValueReads).toBe(0);
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "INVALID_PUBLISHER", path: "$.publisher" },
    });
  });
});
