import { describe, expect, it } from "vitest";
import {
  parseExperiencePackManifest,
  serializeExperiencePackManifest,
} from "../../packages/experience-packs/src/index.js";

const digest = `sha256:${"d".repeat(64)}`;

function manifest() {
  return {
    schemaVersion: "1",
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
      digest,
      size: 1,
    }],
  };
}

function replaceMethod(target: object, key: PropertyKey, replacement: (...args: unknown[]) => unknown): PropertyDescriptor | undefined {
  const previous = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, {
    configurable: true,
    writable: true,
    value: replacement,
  });
  return previous;
}

function restoreMethod(target: object, key: PropertyKey, previous: PropertyDescriptor | undefined): void {
  if (previous) Object.defineProperty(target, key, previous);
  else Reflect.deleteProperty(target, key);
}

describe("Experience Pack parser intrinsic hardening", () => {
  it("does not dispatch through a post-initialization Array iterator replacement", () => {
    const previous = replaceMethod(Array.prototype, Symbol.iterator, () => {
      throw new Error("ambient Array iterator must not execute");
    });
    let result: ReturnType<typeof parseExperiencePackManifest>;

    try {
      result = parseExperiencePackManifest(manifest());
    } finally {
      restoreMethod(Array.prototype, Symbol.iterator, previous);
    }

    expect(result).toMatchObject({ ok: true });
  });

  it("does not dispatch through ambient collection, regex, string, or includes methods", () => {
    const previousSetHas = replaceMethod(Set.prototype, "has", () => {
      throw new Error("ambient Set.prototype.has must not execute");
    });
    const previousSetAdd = replaceMethod(Set.prototype, "add", () => {
      throw new Error("ambient Set.prototype.add must not execute");
    });
    const previousMapHas = replaceMethod(Map.prototype, "has", () => {
      throw new Error("ambient Map.prototype.has must not execute");
    });
    const previousMapGet = replaceMethod(Map.prototype, "get", () => {
      throw new Error("ambient Map.prototype.get must not execute");
    });
    const previousMapSet = replaceMethod(Map.prototype, "set", () => {
      throw new Error("ambient Map.prototype.set must not execute");
    });
    const previousRegExpTest = replaceMethod(RegExp.prototype, "test", () => {
      throw new Error("ambient RegExp.prototype.test must not execute");
    });
    const previousStringSplit = replaceMethod(String.prototype, "split", () => {
      throw new Error("ambient String.prototype.split must not execute");
    });
    const previousArrayIncludes = replaceMethod(Array.prototype, "includes", () => {
      throw new Error("ambient Array.prototype.includes must not execute");
    });
    let result: ReturnType<typeof parseExperiencePackManifest>;

    try {
      result = parseExperiencePackManifest(manifest());
    } finally {
      restoreMethod(Array.prototype, "includes", previousArrayIncludes);
      restoreMethod(String.prototype, "split", previousStringSplit);
      restoreMethod(RegExp.prototype, "test", previousRegExpTest);
      restoreMethod(Map.prototype, "set", previousMapSet);
      restoreMethod(Map.prototype, "get", previousMapGet);
      restoreMethod(Map.prototype, "has", previousMapHas);
      restoreMethod(Set.prototype, "add", previousSetAdd);
      restoreMethod(Set.prototype, "has", previousSetHas);
    }

    expect(result).toMatchObject({ ok: true });
  });

  it("uses the captured JSON serializer for canonical serialization", () => {
    const parsed = parseExperiencePackManifest(manifest());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("fixture must parse");

    const previous = replaceMethod(JSON, "stringify", () => {
      throw new Error("ambient JSON.stringify must not execute");
    });
    let result: ReturnType<typeof serializeExperiencePackManifest>;

    try {
      result = serializeExperiencePackManifest(parsed.value);
    } finally {
      restoreMethod(JSON, "stringify", previous);
    }

    expect(result).toMatchObject({ ok: true });
  });

  it("keeps canonical Pack records independent from later Object.prototype pollution", () => {
    const parsed = parseExperiencePackManifest(manifest());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("fixture must parse");

    expect(Object.getPrototypeOf(parsed.value)).toBe(null);
    expect(Object.getPrototypeOf(parsed.value.publisher)).toBe(null);
    expect(Object.getPrototypeOf(parsed.value.metadata)).toBe(null);
    expect(Object.getPrototypeOf(parsed.value.compatibility)).toBe(null);
    expect(Object.getPrototypeOf(parsed.value.artifacts[0])).toBe(null);

    const previousDescription = Object.getOwnPropertyDescriptor(Object.prototype, "description");
    const previousMaximum = Object.getOwnPropertyDescriptor(Object.prototype, "maxViraVersion");

    try {
      Object.defineProperty(Object.prototype, "description", {
        configurable: true,
        value: "ambient-description",
      });
      Object.defineProperty(Object.prototype, "maxViraVersion", {
        configurable: true,
        value: "999.0.0",
      });

      expect(parsed.value.metadata.description).toBeUndefined();
      expect(parsed.value.compatibility.maxViraVersion).toBeUndefined();
    } finally {
      restoreMethod(Object.prototype, "maxViraVersion", previousMaximum);
      restoreMethod(Object.prototype, "description", previousDescription);
    }
  });
});
