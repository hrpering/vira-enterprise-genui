import { describe, expect, it } from "vitest";
import { parseExperienceRegistrySnapshot } from "../../packages/experience-registry/src/index.js";
import {
  createExperienceMarketplaceCatalog,
  queryExperienceMarketplaceCatalog,
} from "../../packages/experience-marketplace/src/index.js";

const digest = `sha256:${"e".repeat(64)}`;

function restoreProperty(target: object, key: PropertyKey, previous: PropertyDescriptor | undefined): void {
  if (previous) {
    Object.defineProperty(target, key, previous);
  } else {
    Reflect.deleteProperty(target, key);
  }
}

function pack(id: string, name: string, tags: string[]) {
  const publisherId = id.slice(0, id.indexOf("/"));
  return {
    schemaVersion: "1",
    id,
    version: "1.0.0",
    publisher: { id: publisherId, name: publisherId === "vira" ? "Vira" : "Acme" },
    metadata: { name, tags },
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

function registryWithoutOptionalFields() {
  const result = parseExperienceRegistrySnapshot(JSON.stringify({
    schemaVersion: "1",
    manifests: [pack("vira/minimal", "Minimal", ["utility"])],
  }));
  if (!result.ok) throw new Error("registry fixture must be valid");
  return result.value;
}

function registryWithTwoEntries() {
  const result = parseExperienceRegistrySnapshot(JSON.stringify({
    schemaVersion: "1",
    manifests: [
      pack("vira/zulu", "Zulu", ["travel", "booking"]),
      pack("acme/alpha", "Alpha", ["research"]),
    ],
  }));
  if (!result.ok) throw new Error("registry fixture must be valid");
  return result.value;
}

describe("Experience Marketplace prototype-pollution hardening", () => {
  it("does not inherit omitted Pack optional fields into public Marketplace entries", () => {
    const registry = registryWithoutOptionalFields();
    const previousDescription = Object.getOwnPropertyDescriptor(Object.prototype, "description");
    const previousMaximum = Object.getOwnPropertyDescriptor(Object.prototype, "maxViraVersion");
    let reads = 0;
    let result: ReturnType<typeof createExperienceMarketplaceCatalog>;

    try {
      Object.defineProperty(Object.prototype, "description", {
        configurable: true,
        get() {
          reads += 1;
          return "polluted description";
        },
      });
      Object.defineProperty(Object.prototype, "maxViraVersion", {
        configurable: true,
        get() {
          reads += 1;
          return "999.0.0";
        },
      });
      result = createExperienceMarketplaceCatalog(
        registry,
        JSON.stringify([{ id: "vira/minimal", version: "1.0.0" }]),
      );
    } finally {
      restoreProperty(Object.prototype, "description", previousDescription);
      restoreProperty(Object.prototype, "maxViraVersion", previousMaximum);
    }

    expect(reads).toBe(0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const entry = result.value.entries[0];
    expect(entry).toBeDefined();
    if (!entry) return;
    expect(Object.getPrototypeOf(entry)).toBeNull();
    expect(Object.hasOwn(entry, "description")).toBe(false);
    expect(Object.hasOwn(entry, "maxViraVersion")).toBe(false);
    expect(JSON.stringify(entry)).not.toContain("polluted description");
    expect(JSON.stringify(entry)).not.toContain("999.0.0");
  });

  it("normalizes query JSON onto a null-prototype object before optional reads", () => {
    const catalog = createExperienceMarketplaceCatalog(
      registryWithoutOptionalFields(),
      JSON.stringify([{ id: "vira/minimal", version: "1.0.0" }]),
    );
    expect(catalog.ok).toBe(true);
    if (!catalog.ok) return;

    const previousText = Object.getOwnPropertyDescriptor(Object.prototype, "text");
    const previousLimit = Object.getOwnPropertyDescriptor(Object.prototype, "limit");
    let reads = 0;
    let result: ReturnType<typeof queryExperienceMarketplaceCatalog>;

    try {
      Object.defineProperty(Object.prototype, "text", {
        configurable: true,
        get() {
          reads += 1;
          return "does-not-match";
        },
      });
      Object.defineProperty(Object.prototype, "limit", {
        configurable: true,
        get() {
          reads += 1;
          return 0;
        },
      });
      result = queryExperienceMarketplaceCatalog(catalog.value, "{}");
    } finally {
      restoreProperty(Object.prototype, "text", previousText);
      restoreProperty(Object.prototype, "limit", previousLimit);
    }

    expect(reads).toBe(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.entries).toHaveLength(1);
      expect(result.value.entries[0]?.id).toBe("vira/minimal");
    }
  });

  it("copies canonical tags without invoking Array.prototype iterator", () => {
    const registry = registryWithTwoEntries();
    const listingJson = JSON.stringify([{ id: "vira/zulu", version: "1.0.0" }]);
    const previous = Object.getOwnPropertyDescriptor(Array.prototype, Symbol.iterator);
    let calls = 0;
    let result: ReturnType<typeof createExperienceMarketplaceCatalog>;

    try {
      Object.defineProperty(Array.prototype, Symbol.iterator, {
        configurable: true,
        value() {
          calls += 1;
          throw new Error("ambient Array iterator must not execute");
        },
      });
      result = createExperienceMarketplaceCatalog(registry, listingJson);
    } finally {
      restoreProperty(Array.prototype, Symbol.iterator, previous);
    }

    expect(calls).toBe(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.entries[0]?.tags).toEqual(["travel", "booking"]);
    }
  });

  it("preserves canonical listing order without invoking Array.prototype.sort", () => {
    const registry = registryWithTwoEntries();
    const listingJson = JSON.stringify([
      { id: "vira/zulu", version: "1.0.0" },
      { id: "acme/alpha", version: "1.0.0" },
    ]);
    const previous = Object.getOwnPropertyDescriptor(Array.prototype, "sort");
    let calls = 0;
    let result: ReturnType<typeof createExperienceMarketplaceCatalog>;

    try {
      Object.defineProperty(Array.prototype, "sort", {
        configurable: true,
        writable: true,
        value() {
          calls += 1;
          throw new Error("ambient Array sort must not execute");
        },
      });
      result = createExperienceMarketplaceCatalog(registry, listingJson);
    } finally {
      restoreProperty(Array.prototype, "sort", previous);
    }

    expect(calls).toBe(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.entries.map((entry) => entry.id)).toEqual(["acme/alpha", "vira/zulu"]);
    }
  });

  it("matches tags without invoking Array.prototype.includes", () => {
    const catalog = createExperienceMarketplaceCatalog(
      registryWithTwoEntries(),
      JSON.stringify([
        { id: "vira/zulu", version: "1.0.0" },
        { id: "acme/alpha", version: "1.0.0" },
      ]),
    );
    expect(catalog.ok).toBe(true);
    if (!catalog.ok) return;

    const previous = Object.getOwnPropertyDescriptor(Array.prototype, "includes");
    let calls = 0;
    let result: ReturnType<typeof queryExperienceMarketplaceCatalog>;

    try {
      Object.defineProperty(Array.prototype, "includes", {
        configurable: true,
        writable: true,
        value() {
          calls += 1;
          return true;
        },
      });
      result = queryExperienceMarketplaceCatalog(catalog.value, JSON.stringify({ tag: "missing" }));
    } finally {
      restoreProperty(Array.prototype, "includes", previous);
    }

    expect(calls).toBe(0);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.entries).toHaveLength(0);
  });
});
