import { describe, expect, it } from "vitest";
import { parseExperiencePackManifest } from "../../packages/experience-packs/src/index.js";

const TEST_DEFINE_PROPERTY = Object.defineProperty;
const TEST_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const TEST_DELETE_PROPERTY = Reflect.deleteProperty;
const digest = `sha256:${"e".repeat(64)}`;

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
    id: "vira/freeze-proof",
    version: "1.0.0",
    publisher: { id: "vira", name: "Vira" },
    metadata: { name: "Freeze Proof", tags: ["utility"] },
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

describe("Experience Pack canonical freeze intrinsic hardening", () => {
  it("deep-freezes canonical Pack output without ambient Object.freeze or Object.isFrozen", () => {
    const previousFreeze = TEST_GET_OWN_PROPERTY_DESCRIPTOR(Object, "freeze");
    const previousIsFrozen = TEST_GET_OWN_PROPERTY_DESCRIPTOR(Object, "isFrozen");
    let calls = 0;
    let result: ReturnType<typeof parseExperiencePackManifest>;

    try {
      TEST_DEFINE_PROPERTY(Object, "freeze", {
        configurable: true,
        writable: true,
        value<T>(value: T): T {
          calls += 1;
          return value;
        },
      });
      TEST_DEFINE_PROPERTY(Object, "isFrozen", {
        configurable: true,
        writable: true,
        value() {
          calls += 1;
          return false;
        },
      });
      result = parseExperiencePackManifest(manifest());
    } finally {
      restoreProperty(Object, "freeze", previousFreeze);
      restoreProperty(Object, "isFrozen", previousIsFrozen);
    }

    expect(calls).toBe(0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.publisher)).toBe(true);
    expect(Object.isFrozen(result.value.metadata)).toBe(true);
    expect(Object.isFrozen(result.value.metadata.tags)).toBe(true);
    expect(Object.isFrozen(result.value.compatibility)).toBe(true);
    expect(Object.isFrozen(result.value.entrypoints)).toBe(true);
    expect(Object.isFrozen(result.value.artifacts)).toBe(true);
    expect(Object.isFrozen(result.value.artifacts[0])).toBe(true);
  });
});
