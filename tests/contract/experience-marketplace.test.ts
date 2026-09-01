import { describe, expect, it } from "vitest";
import { parseExperienceRegistrySnapshot } from "../../packages/experience-registry/src/index.js";
import {
  createExperienceMarketplaceCatalog,
  isCanonicalExperienceMarketplaceCatalog,
  queryExperienceMarketplaceCatalog,
} from "../../packages/experience-marketplace/src/index.js";
import type { ExperienceMarketplaceQuery } from "../../packages/experience-marketplace/src/index.js";

const digest = `sha256:${"d".repeat(64)}`;

function manifest(
  id: string,
  version: string,
  name: string,
  tags: string[],
  publisherName: string,
) {
  const slash = id.indexOf("/");
  const publisherId = slash > 0 ? id.slice(0, slash) : "invalid";
  return {
    schemaVersion: "1",
    id,
    version,
    publisher: { id: publisherId, name: publisherName },
    metadata: {
      name,
      description: `${name} public description`,
      tags,
    },
    compatibility: { minViraVersion: "0.0.0", maxViraVersion: "2.0.0" },
    entrypoints: ["main"],
    artifacts: [{
      id: "main",
      role: "studio-publication",
      mediaType: "application/json",
      digest,
      size: 1234,
    }],
  };
}

function registry() {
  const result = parseExperienceRegistrySnapshot(JSON.stringify({
    schemaVersion: "1",
    manifests: [
      manifest("vira/flight-booking", "2.0.0", "Flight Booking Pro", ["travel", "booking"], "Vira"),
      manifest("acme/research", "1.0.0", "Research Desk", ["research"], "Acme Labs"),
      manifest("vira/flight-booking", "1.0.0", "Flight Booking", ["travel", "booking"], "Vira"),
    ],
  }));
  if (!result.ok) throw new Error("registry fixture must be valid");
  return result.value;
}

function listings(value: readonly { readonly id: string; readonly version: string }[]) {
  return JSON.stringify(value);
}

function query(value: ExperienceMarketplaceQuery) {
  return JSON.stringify(value);
}

const typedQuery: ExperienceMarketplaceQuery = { text: "flight", limit: 2 };
void typedQuery;

// @ts-expect-error exactOptionalPropertyTypes must reject explicitly undefined query options.
const invalidTypedQuery: ExperienceMarketplaceQuery = { limit: undefined };
void invalidTypedQuery;

describe("Experience Marketplace v1", () => {
  it("lists only explicitly curated exact Registry versions", () => {
    const result = createExperienceMarketplaceCatalog(registry(), listings([
      { id: "vira/flight-booking", version: "2.0.0" },
      { id: "acme/research", version: "1.0.0" },
    ]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.entries.map((entry) => `${entry.id}@${entry.version}`)).toEqual([
      "acme/research@1.0.0",
      "vira/flight-booking@2.0.0",
    ]);
    expect(result.value.entries.some(
      (entry) => entry.id === "vira/flight-booking" && entry.version === "1.0.0",
    )).toBe(false);
    expect(isCanonicalExperienceMarketplaceCatalog(result.value)).toBe(true);
  });

  it("projects only public discovery metadata and omits Pack/runtime distribution details", () => {
    const result = createExperienceMarketplaceCatalog(registry(), listings([
      { id: "vira/flight-booking", version: "2.0.0" },
    ]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.entries[0]).toEqual({
      id: "vira/flight-booking",
      version: "2.0.0",
      publisherId: "vira",
      publisherName: "Vira",
      name: "Flight Booking Pro",
      description: "Flight Booking Pro public description",
      tags: ["travel", "booking"],
      minViraVersion: "0.0.0",
      maxViraVersion: "2.0.0",
    });
    const serialized = JSON.stringify(result.value);
    expect(serialized).not.toContain("sha256:");
    expect(serialized).not.toContain("artifacts");
    expect(serialized).not.toContain("entrypoints");
    expect(serialized).not.toContain("mediaType");
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.entries)).toBe(true);
    expect(Object.isFrozen(result.value.entries[0]?.tags)).toBe(true);
  });

  it("rejects missing and duplicate exact listing refs", () => {
    expect(createExperienceMarketplaceCatalog(registry(), listings([
      { id: "vira/unknown", version: "1.0.0" },
    ]))).toMatchObject({
      ok: false,
      issue: { code: "MISSING_LISTING", path: "$.listings[0]" },
    });

    expect(createExperienceMarketplaceCatalog(registry(), listings([
      { id: "acme/research", version: "1.0.0" },
      { id: "acme/research", version: "1.0.0" },
    ]))).toMatchObject({
      ok: false,
      issue: { code: "DUPLICATE_LISTING", path: "$.listings[1]" },
    });
  });

  it("produces deterministic catalog order regardless of listing JSON order", () => {
    const first = createExperienceMarketplaceCatalog(registry(), listings([
      { id: "vira/flight-booking", version: "2.0.0" },
      { id: "acme/research", version: "1.0.0" },
    ]));
    const second = createExperienceMarketplaceCatalog(registry(), listings([
      { id: "acme/research", version: "1.0.0" },
      { id: "vira/flight-booking", version: "2.0.0" },
    ]));
    expect(first).toEqual(second);
  });

  it("applies deterministic AND filters without scores or hidden ranking", () => {
    const catalog = createExperienceMarketplaceCatalog(registry(), listings([
      { id: "vira/flight-booking", version: "1.0.0" },
      { id: "vira/flight-booking", version: "2.0.0" },
      { id: "acme/research", version: "1.0.0" },
    ]));
    expect(catalog.ok).toBe(true);
    if (!catalog.ok) return;

    const text = queryExperienceMarketplaceCatalog(catalog.value, query({ text: "flight" }));
    expect(text.ok).toBe(true);
    if (text.ok) expect(text.value.entries.map((entry) => entry.version)).toEqual(["1.0.0", "2.0.0"]);

    const filtered = queryExperienceMarketplaceCatalog(catalog.value, query({
      text: "VIRA",
      publisherId: "vira",
      tag: "travel",
      limit: 1,
    }));
    expect(filtered.ok).toBe(true);
    if (filtered.ok) {
      expect(filtered.value.entries).toHaveLength(1);
      expect(filtered.value.entries[0]?.id).toBe("vira/flight-booking");
      expect(JSON.stringify(filtered.value)).not.toContain("score");
      expect(JSON.stringify(filtered.value)).not.toContain("rank");
      expect(Object.isFrozen(filtered.value.entries)).toBe(true);
    }
  });

  it("rejects deserialized, reordered, duplicate and hand-authored catalogs by canonical identity", () => {
    const catalog = createExperienceMarketplaceCatalog(registry(), listings([
      { id: "acme/research", version: "1.0.0" },
      { id: "vira/flight-booking", version: "2.0.0" },
    ]));
    expect(catalog.ok).toBe(true);
    if (!catalog.ok) return;

    const clone = JSON.parse(JSON.stringify(catalog.value)) as {
      entries: unknown[];
    };
    clone.entries.reverse();
    clone.entries.push(clone.entries[0]);

    expect(isCanonicalExperienceMarketplaceCatalog(clone)).toBe(false);
    expect(queryExperienceMarketplaceCatalog(clone, "{}")).toMatchObject({
      ok: false,
      issue: { code: "INVALID_CATALOG", path: "$.catalog" },
    });

    const fake = {
      schemaVersion: "1",
      entries: [{
        id: "acme/fake",
        version: "not-semver",
        publisherId: "vira",
        publisherName: "Fake",
        name: "Fake",
        tags: [],
        minViraVersion: "0.0.0",
      }],
    };
    expect(queryExperienceMarketplaceCatalog(fake, "{}")).toMatchObject({
      ok: false,
      issue: { code: "INVALID_CATALOG" },
    });
  });

  it("rejects noncanonical catalog Proxies by identity without invoking traps", () => {
    let reads = 0;
    const proxy = new Proxy({}, {
      get(target, property, receiver) {
        reads += 1;
        return Reflect.get(target, property, receiver);
      },
      ownKeys(target) {
        reads += 1;
        return Reflect.ownKeys(target);
      },
    });

    expect(queryExperienceMarketplaceCatalog(proxy, "{}")).toMatchObject({
      ok: false,
      issue: { code: "INVALID_CATALOG" },
    });
    expect(reads).toBe(0);
  });

  it("uses JSON text for listing ingress and rejects arbitrary object/accessor/custom-array state before reflection", () => {
    let reads = 0;
    const listing: Record<string, unknown> = { version: "1.0.0" };
    Object.defineProperty(listing, "id", {
      enumerable: true,
      get() {
        reads += 1;
        return "acme/research";
      },
    });
    const customArray = Object.setPrototypeOf([listing], null);

    expect(createExperienceMarketplaceCatalog(registry(), customArray)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_LISTINGS", path: "$.listings" },
    });
    expect(reads).toBe(0);
  });

  it("rejects listing JSON extensions without reflecting arbitrary field names", () => {
    const sensitiveField = "customer@example.com";
    const result = createExperienceMarketplaceCatalog(registry(), JSON.stringify([{
      id: "acme/research",
      version: "1.0.0",
      [sensitiveField]: true,
    }]));
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "INVALID_LISTING", path: "$.listings[0]" },
    });
    expect(JSON.stringify(result)).not.toContain(sensitiveField);
  });

  it("rejects noncanonical Registry input without inspecting arbitrary objects", () => {
    let reads = 0;
    const registryProxy = new Proxy({}, {
      get(target, property, receiver) {
        reads += 1;
        return Reflect.get(target, property, receiver);
      },
      ownKeys(target) {
        reads += 1;
        return Reflect.ownKeys(target);
      },
    });

    expect(createExperienceMarketplaceCatalog(registryProxy, "[]")).toEqual({
      ok: false,
      issue: {
        code: "INVALID_REGISTRY",
        path: "$.registry",
        message: "experience marketplace requires a canonical Experience Registry snapshot",
      },
    });
    expect(reads).toBe(0);
  });

  it("uses JSON text for queries so explicit undefined/accessors/object extensions cannot cross the boundary", () => {
    const catalog = createExperienceMarketplaceCatalog(registry(), listings([
      { id: "acme/research", version: "1.0.0" },
    ]));
    expect(catalog.ok).toBe(true);
    if (!catalog.ok) return;

    let reads = 0;
    const objectQuery: Record<string, unknown> = { limit: undefined };
    Object.defineProperty(objectQuery, "text", {
      enumerable: true,
      get() {
        reads += 1;
        return "research";
      },
    });
    expect(queryExperienceMarketplaceCatalog(catalog.value, objectQuery)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_QUERY", path: "$.query" },
    });
    expect(reads).toBe(0);

    const sensitiveField = "prompt fragment@example.com";
    const unknown = queryExperienceMarketplaceCatalog(catalog.value, JSON.stringify({
      text: "research",
      [sensitiveField]: true,
    }));
    expect(unknown).toMatchObject({
      ok: false,
      issue: { code: "INVALID_QUERY", path: "$.query" },
    });
    expect(JSON.stringify(unknown)).not.toContain(sensitiveField);
  });

  it("rejects invalid query JSON values and bounds", () => {
    const catalog = createExperienceMarketplaceCatalog(registry(), listings([
      { id: "acme/research", version: "1.0.0" },
    ]));
    expect(catalog.ok).toBe(true);
    if (!catalog.ok) return;

    for (const invalid of [
      "{not-json",
      "[]",
      JSON.stringify({ limit: 0 }),
      JSON.stringify({ limit: 101 }),
      JSON.stringify({ text: "" }),
      JSON.stringify({ publisherId: null }),
    ]) {
      expect(queryExperienceMarketplaceCatalog(catalog.value, invalid)).toMatchObject({
        ok: false,
        issue: { code: "INVALID_QUERY", path: "$.query" },
      });
    }
  });
});
