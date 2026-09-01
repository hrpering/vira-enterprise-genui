import { describe, expect, it } from "vitest";
import { parseExperienceRegistrySnapshot } from "../../packages/experience-registry/src/index.js";
import {
  createExperienceMarketplaceCatalog,
  isCanonicalExperienceMarketplaceCatalog,
  queryExperienceMarketplaceCatalog,
} from "../../packages/experience-marketplace/src/index.js";

const digest = `sha256:${"9".repeat(64)}`;

function restoreProperty(target: object, key: PropertyKey, previous: PropertyDescriptor | undefined): void {
  if (previous) {
    Object.defineProperty(target, key, previous);
  } else {
    Reflect.deleteProperty(target, key);
  }
}

function registry() {
  const result = parseExperienceRegistrySnapshot(JSON.stringify({
    schemaVersion: "1",
    manifests: [{
      schemaVersion: "1",
      id: "vira/minimal",
      version: "1.0.0",
      publisher: { id: "vira", name: "Vira" },
      metadata: { name: "Minimal Experience", tags: ["utility"] },
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

function catalog() {
  const result = createExperienceMarketplaceCatalog(
    registry(),
    JSON.stringify([{ id: "vira/minimal", version: "1.0.0" }]),
  );
  if (!result.ok) throw new Error("catalog fixture must be valid");
  return result.value;
}

describe("Experience Marketplace protected intrinsic hardening", () => {
  it("does not let WeakSet.prototype.has forge canonical catalog identity", () => {
    const canonical = catalog();
    const fake = { schemaVersion: "1", entries: canonical.entries };
    const previous = Object.getOwnPropertyDescriptor(WeakSet.prototype, "has");
    let calls = 0;
    let realResult: boolean;
    let fakeResult: boolean;
    let fakeQuery: ReturnType<typeof queryExperienceMarketplaceCatalog>;

    try {
      Object.defineProperty(WeakSet.prototype, "has", {
        configurable: true,
        writable: true,
        value() {
          calls += 1;
          return true;
        },
      });
      realResult = isCanonicalExperienceMarketplaceCatalog(canonical);
      fakeResult = isCanonicalExperienceMarketplaceCatalog(fake);
      fakeQuery = queryExperienceMarketplaceCatalog(fake, "{}");
    } finally {
      restoreProperty(WeakSet.prototype, "has", previous);
    }

    expect(calls).toBe(0);
    expect(realResult).toBe(true);
    expect(fakeResult).toBe(false);
    expect(fakeQuery).toMatchObject({ ok: false, issue: { code: "INVALID_CATALOG" } });
  });

  it("registers canonical catalogs without WeakSet.prototype.add", () => {
    const snapshot = registry();
    const previous = Object.getOwnPropertyDescriptor(WeakSet.prototype, "add");
    let calls = 0;
    let result: ReturnType<typeof createExperienceMarketplaceCatalog>;

    try {
      Object.defineProperty(WeakSet.prototype, "add", {
        configurable: true,
        writable: true,
        value() {
          calls += 1;
          throw new Error("ambient WeakSet.add must not execute");
        },
      });
      result = createExperienceMarketplaceCatalog(
        snapshot,
        JSON.stringify([{ id: "vira/minimal", version: "1.0.0" }]),
      );
    } finally {
      restoreProperty(WeakSet.prototype, "add", previous);
    }

    expect(calls).toBe(0);
    expect(result.ok).toBe(true);
    if (result.ok) expect(isCanonicalExperienceMarketplaceCatalog(result.value)).toBe(true);
  });

  it("rejects unsupported query fields without Set.prototype.has", () => {
    const canonical = catalog();
    const previous = Object.getOwnPropertyDescriptor(Set.prototype, "has");
    let calls = 0;
    let result: ReturnType<typeof queryExperienceMarketplaceCatalog>;

    try {
      Object.defineProperty(Set.prototype, "has", {
        configurable: true,
        writable: true,
        value() {
          calls += 1;
          return true;
        },
      });
      result = queryExperienceMarketplaceCatalog(canonical, JSON.stringify({ unknown: "value" }));
    } finally {
      restoreProperty(Set.prototype, "has", previous);
    }

    expect(calls).toBe(0);
    expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_QUERY", path: "$.query" } });
  });

  it("matches text without ambient String trim, lowercase, or includes methods", () => {
    const canonical = catalog();
    const previousTrim = Object.getOwnPropertyDescriptor(String.prototype, "trim");
    const previousLower = Object.getOwnPropertyDescriptor(String.prototype, "toLowerCase");
    const previousIncludes = Object.getOwnPropertyDescriptor(String.prototype, "includes");
    let calls = 0;
    let result: ReturnType<typeof queryExperienceMarketplaceCatalog>;

    try {
      Object.defineProperty(String.prototype, "trim", {
        configurable: true,
        writable: true,
        value() {
          calls += 1;
          throw new Error("ambient String.trim must not execute");
        },
      });
      Object.defineProperty(String.prototype, "toLowerCase", {
        configurable: true,
        writable: true,
        value() {
          calls += 1;
          throw new Error("ambient String.toLowerCase must not execute");
        },
      });
      Object.defineProperty(String.prototype, "includes", {
        configurable: true,
        writable: true,
        value() {
          calls += 1;
          return false;
        },
      });
      result = queryExperienceMarketplaceCatalog(canonical, JSON.stringify({ text: "MINIMAL" }));
    } finally {
      restoreProperty(String.prototype, "trim", previousTrim);
      restoreProperty(String.prototype, "toLowerCase", previousLower);
      restoreProperty(String.prototype, "includes", previousIncludes);
    }

    expect(calls).toBe(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.entries).toHaveLength(1);
      expect(result.value.entries[0]?.id).toBe("vira/minimal");
    }
  });
});
