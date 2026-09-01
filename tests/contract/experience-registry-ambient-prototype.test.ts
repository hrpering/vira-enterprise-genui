import { describe, expect, it } from "vitest";
import {
  isCanonicalExperienceRegistrySnapshot,
  lookupExperienceRegistryManifest,
  parseExperienceRegistrySnapshot,
} from "../../packages/experience-registry/src/index.js";

const digest = `sha256:${"f".repeat(64)}`;

function restoreProperty(target: object, key: PropertyKey, previous: PropertyDescriptor | undefined): void {
  if (previous) {
    Object.defineProperty(target, key, previous);
  } else {
    Reflect.deleteProperty(target, key);
  }
}

function serializedRegistry() {
  return JSON.stringify({
    schemaVersion: "1",
    manifests: [{
      schemaVersion: "1",
      id: "vira/minimal",
      version: "1.0.0",
      publisher: { id: "vira", name: "Vira" },
      metadata: { name: "Minimal", tags: ["utility"] },
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

function registry() {
  const result = parseExperienceRegistrySnapshot(serializedRegistry());
  if (!result.ok) throw new Error("registry fixture must be valid");
  return result.value;
}

describe("Experience Registry ambient prototype hardening", () => {
  it("performs exact lookup without Array.prototype.find", () => {
    const snapshot = registry();
    const previous = Object.getOwnPropertyDescriptor(Array.prototype, "find");
    let calls = 0;
    let hit: ReturnType<typeof lookupExperienceRegistryManifest>;
    let miss: ReturnType<typeof lookupExperienceRegistryManifest>;

    try {
      Object.defineProperty(Array.prototype, "find", {
        configurable: true,
        writable: true,
        value() {
          calls += 1;
          throw new Error("ambient Array.find must not execute");
        },
      });
      hit = lookupExperienceRegistryManifest(snapshot, "vira/minimal", "1.0.0");
      miss = lookupExperienceRegistryManifest(snapshot, "vira/missing", "1.0.0");
    } finally {
      restoreProperty(Array.prototype, "find", previous);
    }

    expect(calls).toBe(0);
    expect(hit).toMatchObject({ ok: true, value: { manifest: { id: "vira/minimal", version: "1.0.0" } } });
    expect(miss).toEqual({ ok: true, value: { manifest: null } });
  });

  it("checks canonical snapshot identity without WeakSet.prototype.has", () => {
    const snapshot = registry();
    const fake = { schemaVersion: "1", manifests: [] };
    const previous = Object.getOwnPropertyDescriptor(WeakSet.prototype, "has");
    let calls = 0;
    let realResult: boolean;
    let fakeResult: boolean;

    try {
      Object.defineProperty(WeakSet.prototype, "has", {
        configurable: true,
        writable: true,
        value() {
          calls += 1;
          return true;
        },
      });
      realResult = isCanonicalExperienceRegistrySnapshot(snapshot);
      fakeResult = isCanonicalExperienceRegistrySnapshot(fake);
    } finally {
      restoreProperty(WeakSet.prototype, "has", previous);
    }

    expect(calls).toBe(0);
    expect(realResult).toBe(true);
    expect(fakeResult).toBe(false);
  });

  it("registers canonical snapshots without WeakSet.prototype.add", () => {
    const previous = Object.getOwnPropertyDescriptor(WeakSet.prototype, "add");
    let calls = 0;
    let result: ReturnType<typeof parseExperienceRegistrySnapshot>;

    try {
      Object.defineProperty(WeakSet.prototype, "add", {
        configurable: true,
        writable: true,
        value() {
          calls += 1;
          throw new Error("ambient WeakSet.add must not execute");
        },
      });
      result = parseExperienceRegistrySnapshot(serializedRegistry());
    } finally {
      restoreProperty(WeakSet.prototype, "add", previous);
    }

    expect(calls).toBe(0);
    expect(result.ok).toBe(true);
    if (result.ok) expect(isCanonicalExperienceRegistrySnapshot(result.value)).toBe(true);
  });

  it("validates lookup strings without String.prototype.trim", () => {
    const snapshot = registry();
    const previous = Object.getOwnPropertyDescriptor(String.prototype, "trim");
    let calls = 0;
    let result: ReturnType<typeof lookupExperienceRegistryManifest>;

    try {
      Object.defineProperty(String.prototype, "trim", {
        configurable: true,
        writable: true,
        value() {
          calls += 1;
          throw new Error("ambient String.trim must not execute");
        },
      });
      result = lookupExperienceRegistryManifest(snapshot, "vira/minimal", "1.0.0");
    } finally {
      restoreProperty(String.prototype, "trim", previous);
    }

    expect(calls).toBe(0);
    expect(result).toMatchObject({ ok: true, value: { manifest: { id: "vira/minimal" } } });
  });
});
