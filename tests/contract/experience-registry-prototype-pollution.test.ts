import { describe, expect, it } from "vitest";
import { parseExperienceRegistrySnapshot } from "../../packages/experience-registry/src/index.js";

function restoreProperty(target: object, key: PropertyKey, previous: PropertyDescriptor | undefined): void {
  if (previous) {
    Object.defineProperty(target, key, previous);
  } else {
    Reflect.deleteProperty(target, key);
  }
}

function validPack(id: string, version: string) {
  const publisherId = id.slice(0, id.indexOf("/"));
  return {
    schemaVersion: "1",
    id,
    version,
    publisher: { id: publisherId, name: publisherId },
    metadata: { name: id, tags: [] },
    compatibility: { minViraVersion: "0.0.0" },
    entrypoints: ["main"],
    artifacts: [{
      id: "main",
      role: "studio-publication",
      mediaType: "application/json",
      digest: `sha256:${"a".repeat(64)}`,
      size: 1,
    }],
  };
}

describe("Experience Registry prototype-pollution hardening", () => {
  it("detaches array slots without invoking inherited numeric setters", () => {
    const input = JSON.stringify({ schemaVersion: "1", manifests: [] });
    const previous = Object.getOwnPropertyDescriptor(Array.prototype, "0");
    let writes = 0;
    let result: ReturnType<typeof parseExperienceRegistrySnapshot>;

    try {
      Object.defineProperty(Array.prototype, "0", {
        configurable: true,
        set() {
          writes += 1;
        },
      });
      result = parseExperienceRegistrySnapshot(input);
    } finally {
      restoreProperty(Array.prototype, "0", previous);
    }

    expect(writes).toBe(0);
    expect(result).toMatchObject({ ok: true });
  });

  it("defines canonical manifest slots as own properties instead of invoking inherited setters", () => {
    const input = JSON.stringify({
      schemaVersion: "1",
      manifests: [
        validPack("acme/research", "1.0.0"),
        validPack("vira/flight-booking", "1.0.0"),
      ],
    });
    const previous = Object.getOwnPropertyDescriptor(Array.prototype, "1");
    let writes = 0;
    let result: ReturnType<typeof parseExperienceRegistrySnapshot>;

    try {
      Object.defineProperty(Array.prototype, "1", {
        configurable: true,
        set() {
          writes += 1;
        },
      });
      result = parseExperienceRegistrySnapshot(input);
    } finally {
      restoreProperty(Array.prototype, "1", previous);
    }

    expect(writes).toBe(0);
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.value.manifests.map((entry) => entry.id)).toEqual([
        "acme/research",
        "vira/flight-booking",
      ]);
    }
  });

  it("removes inherited Object.prototype Pack fields before canonical delegation", () => {
    const invalidPack = {
      id: "vira/flight-booking",
      version: "1.0.0",
      publisher: { id: "vira", name: "Vira" },
      metadata: { name: "Flight Booking", tags: ["travel"] },
      compatibility: { minViraVersion: "0.0.0" },
      entrypoints: ["main"],
      artifacts: [{
        id: "main",
        role: "studio-publication",
        mediaType: "application/json",
        digest: `sha256:${"a".repeat(64)}`,
        size: 1,
      }],
    };
    const input = JSON.stringify({ schemaVersion: "1", manifests: [invalidPack] });
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, "schemaVersion");
    let reads = 0;
    let result: ReturnType<typeof parseExperienceRegistrySnapshot>;

    try {
      Object.defineProperty(Object.prototype, "schemaVersion", {
        configurable: true,
        get() {
          reads += 1;
          return "1";
        },
      });
      result = parseExperienceRegistrySnapshot(input);
    } finally {
      restoreProperty(Object.prototype, "schemaVersion", previous);
    }

    expect(reads).toBe(0);
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "INVALID_MANIFEST", path: "$.manifests[0]" },
    });
  });
});
