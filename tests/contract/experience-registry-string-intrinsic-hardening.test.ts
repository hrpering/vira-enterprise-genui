import { describe, expect, it } from "vitest";
import {
  lookupExperienceRegistryManifest,
  parseExperienceRegistrySnapshot,
} from "../../packages/experience-registry/src/index.js";

const TEST_DEFINE_PROPERTY = Object.defineProperty;
const TEST_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const TEST_DELETE_PROPERTY = Reflect.deleteProperty;
const digest = `sha256:${"a".repeat(64)}`;

function restoreProperty(target: object, key: PropertyKey, previous: PropertyDescriptor | undefined): void {
  if (previous) {
    TEST_DEFINE_PROPERTY(target, key, previous);
  } else {
    TEST_DELETE_PROPERTY(target, key);
  }
}

function registry() {
  const result = parseExperienceRegistrySnapshot(JSON.stringify({
    schemaVersion: "1",
    manifests: [{
      schemaVersion: "1",
      id: "vira/string-proof",
      version: "1.0.0",
      publisher: { id: "vira", name: "Vira" },
      metadata: { name: "String Proof", tags: ["utility"] },
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
  if (!result.ok) throw new Error("registry fixture must be valid");
  return result.value;
}

describe("Experience Registry numeric key conversion hardening", () => {
  it("looks up canonical manifests without the mutable global String constructor", () => {
    const snapshot = registry();
    const previousString = TEST_GET_OWN_PROPERTY_DESCRIPTOR(globalThis, "String");
    let calls = 0;
    let hit: ReturnType<typeof lookupExperienceRegistryManifest>;
    let miss: ReturnType<typeof lookupExperienceRegistryManifest>;

    try {
      TEST_DEFINE_PROPERTY(globalThis, "String", {
        configurable: true,
        writable: true,
        value() {
          calls += 1;
          throw new Error("ambient global String must not execute");
        },
      });
      hit = lookupExperienceRegistryManifest(snapshot, "vira/string-proof", "1.0.0");
      miss = lookupExperienceRegistryManifest(snapshot, "vira/missing", "1.0.0");
    } finally {
      restoreProperty(globalThis, "String", previousString);
    }

    expect(calls).toBe(0);
    expect(hit).toMatchObject({ ok: true, value: { manifest: { id: "vira/string-proof" } } });
    expect(miss).toEqual({ ok: true, value: { manifest: null } });
  });

  it("treats bounded non-canonical query text as an exact miss rather than Pack syntax", () => {
    const snapshot = registry();

    expect(
      lookupExperienceRegistryManifest(snapshot, " vira/string-proof ", "1.0.0"),
    ).toEqual({ ok: true, value: { manifest: null } });
    expect(
      lookupExperienceRegistryManifest(snapshot, "vira/string-proof", " 1.0.0 "),
    ).toEqual({ ok: true, value: { manifest: null } });
  });
});
