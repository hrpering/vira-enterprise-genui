import { describe, expect, it } from "vitest";
import { parseExperienceRegistrySnapshot } from "../../packages/experience-registry/src/index.js";
import {
  createExperienceMarketplaceCatalog,
  isCanonicalExperienceMarketplaceCatalog,
  queryExperienceMarketplaceCatalog,
} from "../../packages/experience-marketplace/src/index.js";

const TEST_DEFINE_PROPERTY = Object.defineProperty;
const TEST_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const TEST_DELETE_PROPERTY = Reflect.deleteProperty;
const digest = `sha256:${"9".repeat(64)}`;

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
    const previous = TEST_GET_OWN_PROPERTY_DESCRIPTOR(WeakSet.prototype, "has");
    let calls = 0;
    let realResult: boolean;
    let fakeResult: boolean;
    let fakeQuery: ReturnType<typeof queryExperienceMarketplaceCatalog>;

    try {
      TEST_DEFINE_PROPERTY(WeakSet.prototype, "has", {
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
    const previous = TEST_GET_OWN_PROPERTY_DESCRIPTOR(WeakSet.prototype, "add");
    let calls = 0;
    let result: ReturnType<typeof createExperienceMarketplaceCatalog>;

    try {
      TEST_DEFINE_PROPERTY(WeakSet.prototype, "add", {
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
    const previous = TEST_GET_OWN_PROPERTY_DESCRIPTOR(Set.prototype, "has");
    let calls = 0;
    let result: ReturnType<typeof queryExperienceMarketplaceCatalog>;

    try {
      TEST_DEFINE_PROPERTY(Set.prototype, "has", {
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
    const previousTrim = TEST_GET_OWN_PROPERTY_DESCRIPTOR(String.prototype, "trim");
    const previousLower = TEST_GET_OWN_PROPERTY_DESCRIPTOR(String.prototype, "toLowerCase");
    const previousIncludes = TEST_GET_OWN_PROPERTY_DESCRIPTOR(String.prototype, "includes");
    let calls = 0;
    let result: ReturnType<typeof queryExperienceMarketplaceCatalog>;

    try {
      TEST_DEFINE_PROPERTY(String.prototype, "trim", {
        configurable: true,
        writable: true,
        value() {
          calls += 1;
          throw new Error("ambient String.trim must not execute");
        },
      });
      TEST_DEFINE_PROPERTY(String.prototype, "toLowerCase", {
        configurable: true,
        writable: true,
        value() {
          calls += 1;
          throw new Error("ambient String.toLowerCase must not execute");
        },
      });
      TEST_DEFINE_PROPERTY(String.prototype, "includes", {
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

  it("creates a canonical frozen catalog without ambient JSON, descriptor, or freeze methods", () => {
    const snapshot = registry();
    const previousParse = TEST_GET_OWN_PROPERTY_DESCRIPTOR(JSON, "parse");
    const previousDescriptor = TEST_GET_OWN_PROPERTY_DESCRIPTOR(Object, "getOwnPropertyDescriptor");
    const previousFreeze = TEST_GET_OWN_PROPERTY_DESCRIPTOR(Object, "freeze");
    let calls = 0;
    let result: ReturnType<typeof createExperienceMarketplaceCatalog>;

    try {
      TEST_DEFINE_PROPERTY(JSON, "parse", {
        configurable: true,
        writable: true,
        value() {
          calls += 1;
          return [];
        },
      });
      TEST_DEFINE_PROPERTY(Object, "getOwnPropertyDescriptor", {
        configurable: true,
        writable: true,
        value() {
          calls += 1;
          throw new Error("ambient descriptor lookup must not execute");
        },
      });
      TEST_DEFINE_PROPERTY(Object, "freeze", {
        configurable: true,
        writable: true,
        value<T>(value: T): T {
          calls += 1;
          return value;
        },
      });
      result = createExperienceMarketplaceCatalog(
        snapshot,
        '[{"id":"vira/minimal","version":"1.0.0"}]',
      );
    } finally {
      restoreProperty(JSON, "parse", previousParse);
      restoreProperty(Object, "getOwnPropertyDescriptor", previousDescriptor);
      restoreProperty(Object, "freeze", previousFreeze);
    }

    expect(calls).toBe(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.entries).toHaveLength(1);
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(Object.isFrozen(result.value.entries)).toBe(true);
      expect(Object.isFrozen(result.value.entries[0])).toBe(true);
    }
  });

  it("queries a canonical catalog without ambient JSON, descriptor, or freeze methods", () => {
    const canonical = catalog();
    const previousParse = TEST_GET_OWN_PROPERTY_DESCRIPTOR(JSON, "parse");
    const previousDescriptor = TEST_GET_OWN_PROPERTY_DESCRIPTOR(Object, "getOwnPropertyDescriptor");
    const previousFreeze = TEST_GET_OWN_PROPERTY_DESCRIPTOR(Object, "freeze");
    let calls = 0;
    let result: ReturnType<typeof queryExperienceMarketplaceCatalog>;

    try {
      TEST_DEFINE_PROPERTY(JSON, "parse", {
        configurable: true,
        writable: true,
        value() {
          calls += 1;
          return {};
        },
      });
      TEST_DEFINE_PROPERTY(Object, "getOwnPropertyDescriptor", {
        configurable: true,
        writable: true,
        value() {
          calls += 1;
          throw new Error("ambient descriptor lookup must not execute");
        },
      });
      TEST_DEFINE_PROPERTY(Object, "freeze", {
        configurable: true,
        writable: true,
        value<T>(value: T): T {
          calls += 1;
          return value;
        },
      });
      result = queryExperienceMarketplaceCatalog(canonical, '{"publisherId":"not-vira"}');
    } finally {
      restoreProperty(JSON, "parse", previousParse);
      restoreProperty(Object, "getOwnPropertyDescriptor", previousDescriptor);
      restoreProperty(Object, "freeze", previousFreeze);
    }

    expect(calls).toBe(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.entries).toHaveLength(0);
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(Object.isFrozen(result.value.entries)).toBe(true);
    }
  });

  it("uses captured creation, definition, array, and number intrinsics", () => {
    const snapshot = registry();
    const previousCreate = TEST_GET_OWN_PROPERTY_DESCRIPTOR(Object, "create");
    const previousDefine = TEST_GET_OWN_PROPERTY_DESCRIPTOR(Object, "defineProperty");
    const previousArray = TEST_GET_OWN_PROPERTY_DESCRIPTOR(Array, "isArray");
    const previousSafeInteger = TEST_GET_OWN_PROPERTY_DESCRIPTOR(Number, "isSafeInteger");
    let calls = 0;
    let catalogResult: ReturnType<typeof createExperienceMarketplaceCatalog>;
    let queryResult: ReturnType<typeof queryExperienceMarketplaceCatalog> | undefined;

    try {
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
      TEST_DEFINE_PROPERTY(Array, "isArray", {
        configurable: true,
        writable: true,
        value() {
          calls += 1;
          return false;
        },
      });
      TEST_DEFINE_PROPERTY(Number, "isSafeInteger", {
        configurable: true,
        writable: true,
        value() {
          calls += 1;
          return false;
        },
      });

      catalogResult = createExperienceMarketplaceCatalog(
        snapshot,
        '[{"id":"vira/minimal","version":"1.0.0"}]',
      );
      if (catalogResult.ok) {
        queryResult = queryExperienceMarketplaceCatalog(catalogResult.value, '{"limit":1}');
      }
    } finally {
      restoreProperty(Object, "create", previousCreate);
      restoreProperty(Object, "defineProperty", previousDefine);
      restoreProperty(Array, "isArray", previousArray);
      restoreProperty(Number, "isSafeInteger", previousSafeInteger);
    }

    expect(calls).toBe(0);
    expect(catalogResult.ok).toBe(true);
    expect(queryResult?.ok).toBe(true);
    if (queryResult?.ok) expect(queryResult.value.entries).toHaveLength(1);
  });
});
