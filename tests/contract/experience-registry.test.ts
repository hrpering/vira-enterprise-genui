import { describe, expect, it } from "vitest";
import { parseExperiencePackManifest } from "../../packages/experience-packs/src/index.js";
import {
  createExperienceRegistrySnapshot,
  EXPERIENCE_REGISTRY_MAX_DEPTH,
  EXPERIENCE_REGISTRY_MAX_MANIFESTS,
  lookupExperienceRegistryManifest,
} from "../../packages/experience-registry/src/index.js";

const digest = `sha256:${"b".repeat(64)}`;

function manifest(id = "vira/flight-booking", version = "1.0.0") {
  return {
    schemaVersion: "1",
    id,
    version,
    publisher: { id: id.split("/")[0], name: "Vira" },
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

function snapshot(manifests: readonly unknown[]) {
  return { schemaVersion: "1", manifests };
}

describe("Experience Registry v1", () => {
  it("delegates Pack semantics and builds a deterministic immutable snapshot", () => {
    const second = manifest("vira/flight-booking", "2.0.0");
    const first = manifest("acme/assistant", "1.0.0");
    const third = manifest("vira/flight-booking", "1.0.0");

    const result = createExperienceRegistrySnapshot(snapshot([second, third, first]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.manifests.map((entry) => `${entry.id}@${entry.version}`)).toEqual([
      "acme/assistant@1.0.0",
      "vira/flight-booking@1.0.0",
      "vira/flight-booking@2.0.0",
    ]);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.manifests)).toBe(true);

    const canonical = parseExperiencePackManifest(first);
    expect(canonical.ok).toBe(true);
    if (canonical.ok) expect(result.value.manifests[0]).toEqual(canonical.value);
  });

  it("rejects duplicate exact pack id and version pairs while allowing multiple versions", () => {
    expect(createExperienceRegistrySnapshot(snapshot([
      manifest("vira/flight-booking", "1.0.0"),
      manifest("vira/flight-booking", "1.0.0"),
    ]))).toMatchObject({
      ok: false,
      issue: { code: "DUPLICATE_MANIFEST", path: "$.manifests[1]" },
    });

    expect(createExperienceRegistrySnapshot(snapshot([
      manifest("vira/flight-booking", "1.0.0"),
      manifest("vira/flight-booking", "2.0.0"),
    ]))).toMatchObject({ ok: true });
  });

  it("normalizes Pack validation failures without echoing arbitrary rejected field names", () => {
    const sensitiveField = "customer@example.com";
    const invalid = {
      ...manifest(),
      [sensitiveField]: "secret",
    };
    const result = createExperienceRegistrySnapshot(snapshot([invalid]));
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

  it("rejects accessor-backed nested manifest state before delegating without executing getters", () => {
    let reads = 0;
    const input = manifest();
    Object.defineProperty(input.metadata, "name", {
      enumerable: true,
      get() {
        reads += 1;
        return "Secret";
      },
    });

    expect(createExperienceRegistrySnapshot(snapshot([input]))).toMatchObject({
      ok: false,
      issue: { code: "UNSAFE_MANIFEST", path: "$.manifests" },
    });
    expect(reads).toBe(0);
  });

  it("rejects symbol-backed and custom-array manifest state", () => {
    const symbolInput = manifest();
    Object.defineProperty(symbolInput.metadata, Symbol("secret"), { value: true });
    expect(createExperienceRegistrySnapshot(snapshot([symbolInput]))).toMatchObject({
      ok: false,
      issue: { code: "UNSAFE_MANIFEST" },
    });

    const customArray = manifest();
    Object.defineProperty(customArray.metadata.tags, "secret", { value: true, enumerable: true });
    expect(createExperienceRegistrySnapshot(snapshot([customArray]))).toMatchObject({
      ok: false,
      issue: { code: "UNSAFE_MANIFEST" },
    });
  });

  it("enforces the snapshot manifest count limit before Pack traversal", () => {
    const manifests = Array.from(
      { length: EXPERIENCE_REGISTRY_MAX_MANIFESTS + 1 },
      (_, index) => manifest("vira/flight-booking", `0.0.${index}`),
    );
    expect(createExperienceRegistrySnapshot(snapshot(manifests))).toMatchObject({
      ok: false,
      issue: { code: "MANIFEST_LIMIT_EXCEEDED", path: "$.manifests" },
    });
  });

  it("enforces the generic plain-data depth budget before delegating to Pack parsing", () => {
    const input = manifest();
    let nested: Record<string, unknown> = { leaf: true };
    for (let index = 0; index <= EXPERIENCE_REGISTRY_MAX_DEPTH; index += 1) {
      nested = { child: nested };
    }
    (input as Record<string, unknown>)["unexpectedDeepGraph"] = nested;

    expect(createExperienceRegistrySnapshot(snapshot([input]))).toMatchObject({
      ok: false,
      issue: { code: "UNSAFE_MANIFEST", path: "$.manifests" },
    });
  });

  it("performs exact id and version lookup with explicit null misses and no latest alias", () => {
    const registry = createExperienceRegistrySnapshot(snapshot([
      manifest("vira/flight-booking", "1.0.0"),
      manifest("vira/flight-booking", "2.0.0"),
    ]));
    expect(registry.ok).toBe(true);
    if (!registry.ok) return;

    const hit = lookupExperienceRegistryManifest(registry.value, {
      id: "vira/flight-booking",
      version: "2.0.0",
    });
    expect(hit.ok).toBe(true);
    if (hit.ok) {
      expect(hit.value.manifest?.version).toBe("2.0.0");
      expect(Object.isFrozen(hit.value)).toBe(true);
    }

    expect(lookupExperienceRegistryManifest(registry.value, {
      id: "vira/flight-booking",
      version: "3.0.0",
    })).toEqual({ ok: true, value: { manifest: null } });

    expect(lookupExperienceRegistryManifest(registry.value, {
      id: "vira/flight-booking",
      version: "latest",
    })).toEqual({ ok: true, value: { manifest: null } });
  });

  it("fails closed on invalid snapshot/query wrappers without reflecting arbitrary query keys", () => {
    expect(lookupExperienceRegistryManifest({ schemaVersion: "2", manifests: [] }, {
      id: "vira/flight-booking",
      version: "1.0.0",
    })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_SNAPSHOT", path: "$.snapshot" },
    });

    const registry = createExperienceRegistrySnapshot(snapshot([manifest()]));
    expect(registry.ok).toBe(true);
    if (!registry.ok) return;

    const sensitiveField = "prompt fragment@example.com";
    const query = {
      id: "vira/flight-booking",
      version: "1.0.0",
      [sensitiveField]: true,
    };
    const result = lookupExperienceRegistryManifest(registry.value, query);
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "INVALID_QUERY", path: "$.query" },
    });
    expect(JSON.stringify(result)).not.toContain(sensitiveField);
  });

  it("rejects accessor-backed lookup queries without executing getters", () => {
    const registry = createExperienceRegistrySnapshot(snapshot([manifest()]));
    expect(registry.ok).toBe(true);
    if (!registry.ok) return;

    let reads = 0;
    const query: Record<string, unknown> = { version: "1.0.0" };
    Object.defineProperty(query, "id", {
      enumerable: true,
      get() {
        reads += 1;
        return "vira/flight-booking";
      },
    });
    expect(lookupExperienceRegistryManifest(registry.value, query)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_QUERY", path: "$.query" },
    });
    expect(reads).toBe(0);
  });
});
