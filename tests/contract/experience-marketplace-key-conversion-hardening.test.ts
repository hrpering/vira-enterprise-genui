import { describe, expect, it } from "vitest";
import { parseExperienceRegistrySnapshot } from "../../packages/experience-registry/src/index.js";
import {
  createExperienceMarketplaceCatalog,
  queryExperienceMarketplaceCatalog,
} from "../../packages/experience-marketplace/src/index.js";

const TEST_DEFINE_PROPERTY = Object.defineProperty;
const TEST_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const TEST_DELETE_PROPERTY = Reflect.deleteProperty;
const digest = `sha256:${"d".repeat(64)}`;

function restoreProperty(target: object, key: PropertyKey, previous: PropertyDescriptor | undefined): void {
  if (previous) {
    TEST_DEFINE_PROPERTY(target, key, previous);
  } else {
    TEST_DELETE_PROPERTY(target, key);
  }
}

function catalog() {
  const registry = parseExperienceRegistrySnapshot(JSON.stringify({
    schemaVersion: "1",
    manifests: [{
      schemaVersion: "1",
      id: "vira/key-proof",
      version: "1.0.0",
      publisher: { id: "vira", name: "Vira" },
      metadata: { name: "Key Proof", tags: ["utility"] },
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
  }));
  if (!registry.ok) throw new Error("registry fixture must be valid");

  const result = createExperienceMarketplaceCatalog(
    registry.value,
    JSON.stringify([{ id: "vira/key-proof", version: "1.0.0" }]),
  );
  if (!result.ok) throw new Error("catalog fixture must be valid");
  return result.value;
}

describe("Experience Marketplace numeric key conversion hardening", () => {
  it("queries canonical entries without the mutable global String constructor", () => {
    const canonical = catalog();
    const previousString = TEST_GET_OWN_PROPERTY_DESCRIPTOR(globalThis, "String");
    let calls = 0;
    let result: ReturnType<typeof queryExperienceMarketplaceCatalog>;

    try {
      TEST_DEFINE_PROPERTY(globalThis, "String", {
        configurable: true,
        writable: true,
        value() {
          calls += 1;
          throw new Error("ambient global String must not execute");
        },
      });
      result = queryExperienceMarketplaceCatalog(canonical, '{"tag":"utility","limit":1}');
    } finally {
      restoreProperty(globalThis, "String", previousString);
    }

    expect(calls).toBe(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.entries).toHaveLength(1);
      expect(result.value.entries[0]?.id).toBe("vira/key-proof");
    }
  });
});
