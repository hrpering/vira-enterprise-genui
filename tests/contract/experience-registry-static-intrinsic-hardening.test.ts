import { describe, expect, it } from "vitest";
import { parseExperienceRegistrySnapshot } from "../../packages/experience-registry/src/index.js";

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

function serializedRegistry(): string {
  return JSON.stringify({
    schemaVersion: "1",
    manifests: [{
      schemaVersion: "1",
      id: "vira/static-intrinsic-proof",
      version: "1.0.0",
      publisher: { id: "vira", name: "Vira" },
      metadata: { name: "Static Intrinsic Proof", tags: ["utility"] },
      compatibility: { minViraVersion: "0.0.0" },
      entrypoints: ["main"],
      artifacts: [{
        id: "main",
        role: "studio-publication",
        mediaType: "application/json",
        digest,
        size: 1,
      }],
    }],
  });
}

describe("Experience Registry static intrinsic hardening", () => {
  it("parses after mutable Array/Object statics are replaced", () => {
    const serialized = serializedRegistry();
    const previousArrayIsArray = TEST_GET_OWN_PROPERTY_DESCRIPTOR(Array, "isArray");
    const previousObjectCreate = TEST_GET_OWN_PROPERTY_DESCRIPTOR(Object, "create");
    const previousObjectDefineProperty = TEST_GET_OWN_PROPERTY_DESCRIPTOR(Object, "defineProperty");
    const previousObjectSetPrototypeOf = TEST_GET_OWN_PROPERTY_DESCRIPTOR(Object, "setPrototypeOf");
    let calls = 0;
    let result: ReturnType<typeof parseExperienceRegistrySnapshot>;

    try {
      TEST_DEFINE_PROPERTY(Array, "isArray", {
        configurable: true,
        writable: true,
        value() {
          calls += 1;
          throw new Error("ambient Array.isArray must not execute");
        },
      });
      TEST_DEFINE_PROPERTY(Object, "create", {
        configurable: true,
        writable: true,
        value() {
          calls += 1;
          throw new Error("ambient Object.create must not execute");
        },
      });
      TEST_DEFINE_PROPERTY(Object, "defineProperty", {
        configurable: true,
        writable: true,
        value() {
          calls += 1;
          throw new Error("ambient Object.defineProperty must not execute");
        },
      });
      TEST_DEFINE_PROPERTY(Object, "setPrototypeOf", {
        configurable: true,
        writable: true,
        value() {
          calls += 1;
          throw new Error("ambient Object.setPrototypeOf must not execute");
        },
      });

      result = parseExperienceRegistrySnapshot(serialized);
    } finally {
      restoreProperty(Array, "isArray", previousArrayIsArray);
      restoreProperty(Object, "create", previousObjectCreate);
      restoreProperty(Object, "defineProperty", previousObjectDefineProperty);
      restoreProperty(Object, "setPrototypeOf", previousObjectSetPrototypeOf);
    }

    expect(calls).toBe(0);
    expect(result.ok).toBe(true);
  });
});
