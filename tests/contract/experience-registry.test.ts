import { describe, expect, it } from "vitest";
import { parseExperiencePackManifest } from "../../packages/experience-packs/src/index.js";
import {
  EXPERIENCE_REGISTRY_MAX_MANIFESTS,
  EXPERIENCE_REGISTRY_QUERY_MAX_LENGTH,
  isCanonicalExperienceRegistrySnapshot,
  lookupExperienceRegistryManifest,
  parseExperienceRegistrySnapshot,
} from "../../packages/experience-registry/src/index.js";

const digest = `sha256:${"b".repeat(64)}`;

function manifest(id = "vira/flight-booking", version = "1.0.0") {
  const slash = id.indexOf("/");
  const publisherId = slash > 0 ? id.slice(0, slash) : "invalid";
  return {
    schemaVersion: "1",
    id,
    version,
    publisher: { id: publisherId, name: "Vira" },
    metadata: {
      name: `Experience ${version}`,
      tags: ["travel"],
    },
    compatibility: { minViraVersion: "0.0.0" },
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

function serialized(manifests: readonly unknown[], extra: Record<string, unknown> = {}) {
  return JSON.stringify({ schemaVersion: "1", manifests, ...extra });
}

describe("Experience Registry v1", () => {
  it("delegates Pack semantics and parses a deterministic immutable canonical snapshot", () => {
    const second = manifest("vira/flight-booking", "2.0.0");
    const first = manifest("acme/assistant", "1.0.0");
    const third = manifest("vira/flight-booking", "1.0.0");

    const result = parseExperienceRegistrySnapshot(serialized([second, third, first]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.manifests.map((entry) => `${entry.id}@${entry.version}`)).toEqual([
      "acme/assistant@1.0.0",
      "vira/flight-booking@1.0.0",
      "vira/flight-booking@2.0.0",
    ]);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.manifests)).toBe(true);
    expect(isCanonicalExperienceRegistrySnapshot(result.value)).toBe(true);

    const canonical = parseExperiencePackManifest(first);
    expect(canonical.ok).toBe(true);
    if (canonical.ok) expect(result.value.manifests[0]).toEqual(canonical.value);
  });

  it("rejects duplicate exact pack id and version pairs while allowing multiple versions", () => {
    expect(parseExperienceRegistrySnapshot(serialized([
      manifest("vira/flight-booking", "1.0.0"),
      manifest("vira/flight-booking", "1.0.0"),
    ]))).toMatchObject({
      ok: false,
      issue: { code: "DUPLICATE_MANIFEST", path: "$.manifests[1]" },
    });

    expect(parseExperienceRegistrySnapshot(serialized([
      manifest("vira/flight-booking", "1.0.0"),
      manifest("vira/flight-booking", "2.0.0"),
    ]))).toMatchObject({ ok: true });
  });

  it("normalizes Pack validation failures without echoing arbitrary rejected field names", () => {
    const sensitiveField = "customer@example.com";
    const invalid = { ...manifest(), [sensitiveField]: "secret" };
    const result = parseExperienceRegistrySnapshot(serialized([invalid]));
    expect(result).toEqual({
      ok: false,
      issue: {
        code: "INVALID_MANIFEST",
        path: "$.manifests[0]",
        message: "registry manifest is not a valid canonical Experience Pack manifest",
      },
    });
    expect(JSON.stringify(result)).not.toContain(sensitiveField);
  });

  it("uses bounded JSON text as the untrusted boundary and never reflects arbitrary object or Proxy input", () => {
    let reads = 0;
    const proxy = new Proxy([], {
      get(target, property, receiver) {
        reads += 1;
        return Reflect.get(target, property, receiver);
      },
      ownKeys(target) {
        reads += 1;
        return Reflect.ownKeys(target);
      },
    });

    expect(parseExperienceRegistrySnapshot(proxy)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT", path: "$" },
    });
    expect(reads).toBe(0);

    const objectInput: Record<string, unknown> = {};
    Object.defineProperty(objectInput, "schemaVersion", {
      enumerable: true,
      get() {
        reads += 1;
        return "1";
      },
    });
    expect(parseExperienceRegistrySnapshot(objectInput)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT" },
    });
    expect(reads).toBe(0);
  });

  it("rejects malformed JSON and unknown Registry wrapper fields without reflecting their names", () => {
    expect(parseExperienceRegistrySnapshot("{not-json")).toMatchObject({
      ok: false,
      issue: { code: "INVALID_JSON", path: "$" },
    });

    const sensitiveField = "prompt fragment@example.com";
    const result = parseExperienceRegistrySnapshot(serialized([], { [sensitiveField]: true }));
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "UNKNOWN_FIELD", path: "$" },
    });
    expect(JSON.stringify(result)).not.toContain(sensitiveField);
  });

  it("enforces the snapshot manifest count limit before Pack parsing", () => {
    const manifests = Array.from(
      { length: EXPERIENCE_REGISTRY_MAX_MANIFESTS + 1 },
      (_, index) => manifest("vira/flight-booking", `0.0.${index}`),
    );
    expect(parseExperienceRegistrySnapshot(serialized(manifests))).toMatchObject({
      ok: false,
      issue: { code: "MANIFEST_LIMIT_EXCEEDED", path: "$.manifests" },
    });
  });

  it("performs exact id and version lookup with explicit null misses and no latest alias", () => {
    const registry = parseExperienceRegistrySnapshot(serialized([
      manifest("vira/flight-booking", "1.0.0"),
      manifest("vira/flight-booking", "2.0.0"),
    ]));
    expect(registry.ok).toBe(true);
    if (!registry.ok) return;

    const hit = lookupExperienceRegistryManifest(registry.value, "vira/flight-booking", "2.0.0");
    expect(hit.ok).toBe(true);
    if (hit.ok) {
      expect(hit.value.manifest?.version).toBe("2.0.0");
      expect(Object.isFrozen(hit.value)).toBe(true);
    }

    expect(lookupExperienceRegistryManifest(registry.value, "vira/flight-booking", "3.0.0"))
      .toEqual({ ok: true, value: { manifest: null } });
    expect(lookupExperienceRegistryManifest(registry.value, "vira/flight-booking", "latest"))
      .toEqual({ ok: true, value: { manifest: null } });
  });

  it("keeps lookup safety bounds independent from current Pack id/version grammar", () => {
    const registry = parseExperienceRegistrySnapshot(serialized([manifest()]));
    expect(registry.ok).toBe(true);
    if (!registry.ok) return;

    const futureSized = "x".repeat(512);
    expect(lookupExperienceRegistryManifest(registry.value, futureSized, futureSized))
      .toEqual({ ok: true, value: { manifest: null } });

    const tooLarge = "x".repeat(EXPERIENCE_REGISTRY_QUERY_MAX_LENGTH + 1);
    expect(lookupExperienceRegistryManifest(registry.value, tooLarge, "1.0.0")).toMatchObject({
      ok: false,
      issue: { code: "INVALID_QUERY", path: "$.query" },
    });
  });

  it("rejects noncanonical snapshot objects by identity before reading their properties", () => {
    const registry = parseExperienceRegistrySnapshot(serialized([manifest()]));
    expect(registry.ok).toBe(true);
    if (!registry.ok) return;

    const clone = JSON.parse(JSON.stringify(registry.value)) as unknown;
    expect(isCanonicalExperienceRegistrySnapshot(clone)).toBe(false);
    expect(lookupExperienceRegistryManifest(clone, "vira/flight-booking", "1.0.0")).toMatchObject({
      ok: false,
      issue: { code: "INVALID_SNAPSHOT", path: "$.snapshot" },
    });

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
    expect(lookupExperienceRegistryManifest(proxy, "vira/flight-booking", "1.0.0")).toMatchObject({
      ok: false,
      issue: { code: "INVALID_SNAPSHOT" },
    });
    expect(reads).toBe(0);
  });
});
