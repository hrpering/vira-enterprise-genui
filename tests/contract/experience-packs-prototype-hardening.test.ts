import { describe, expect, it } from "vitest";
import {
  EXPERIENCE_PACK_MAX_ARTIFACTS,
  parseExperiencePackManifest,
} from "../../packages/experience-packs/src/index.js";

const digest = `sha256:${"c".repeat(64)}`;

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

function restoreProperty(target: object, key: PropertyKey, previous: PropertyDescriptor | undefined): void {
  if (previous) {
    Object.defineProperty(target, key, previous);
  } else {
    Reflect.deleteProperty(target, key);
  }
}

function withArrayPrototypeZero<T>(value: unknown, run: () => T): T {
  const previous = Object.getOwnPropertyDescriptor(Array.prototype, "0");
  try {
    Object.defineProperty(Array.prototype, "0", {
      configurable: true,
      writable: true,
      value,
    });
    return run();
  } finally {
    restoreProperty(Array.prototype, "0", previous);
  }
}

describe("Experience Pack prototype-pollution hardening", () => {
  it("does not let inherited Object.prototype fields satisfy required Pack fields", () => {
    const input = manifest();
    delete (input as Partial<typeof input>).schemaVersion;
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, "schemaVersion");
    let reads = 0;
    let result: ReturnType<typeof parseExperiencePackManifest>;

    try {
      Object.defineProperty(Object.prototype, "schemaVersion", {
        configurable: true,
        get() {
          reads += 1;
          return "1";
        },
      });
      result = parseExperiencePackManifest(input);
    } finally {
      restoreProperty(Object.prototype, "schemaVersion", previous);
    }

    expect(reads).toBe(0);
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "INVALID_SCHEMA_VERSION", path: "$.schemaVersion" },
    });
  });

  it("rejects sparse tag arrays instead of reading inherited numeric values", () => {
    const input = manifest();
    input.metadata.tags = new Array<string>(1);
    const result = withArrayPrototypeZero("travel", () => parseExperiencePackManifest(input));

    expect(result).toMatchObject({
      ok: false,
      issue: { code: "INVALID_METADATA", path: "$.metadata.tags" },
    });
  });

  it("rejects sparse artifact arrays instead of reading inherited artifact objects", () => {
    const input = manifest();
    const inheritedArtifact = input.artifacts[0];
    if (!inheritedArtifact) throw new Error("fixture artifact is required");
    input.artifacts = new Array<typeof inheritedArtifact>(1);
    const result = withArrayPrototypeZero(inheritedArtifact, () => parseExperiencePackManifest(input));

    expect(result).toMatchObject({
      ok: false,
      issue: { code: "INVALID_ARTIFACT", path: "$.artifacts" },
    });
  });

  it("rejects sparse entrypoint arrays instead of reading inherited entrypoint values", () => {
    const input = manifest();
    input.entrypoints = new Array<string>(1);
    const result = withArrayPrototypeZero("main", () => parseExperiencePackManifest(input));

    expect(result).toMatchObject({
      ok: false,
      issue: { code: "INVALID_ENTRYPOINT", path: "$.entrypoints" },
    });
  });

  it("reads proxy array length only through its own data descriptor", () => {
    const input = manifest();
    let lengthGets = 0;
    input.entrypoints = new Proxy(input.entrypoints, {
      get(target, property, receiver) {
        if (property === "length") {
          lengthGets += 1;
          throw new Error("length getter trap must not execute");
        }
        return Reflect.get(target, property, receiver);
      },
    });

    const result = parseExperiencePackManifest(input);
    expect(lengthGets).toBe(0);
    expect(result).toMatchObject({ ok: true });
  });

  it("never enumerates nonsemantic named or symbol array properties", () => {
    const input = manifest();
    const tags = ["travel"];
    let ownKeyReads = 0;
    let namedReads = 0;
    Object.defineProperty(tags, "vendorMetadata", {
      enumerable: true,
      get() {
        namedReads += 1;
        return "must-not-read";
      },
    });
    Object.defineProperty(tags, Symbol("vendor"), { value: "must-not-read" });
    input.metadata.tags = new Proxy(tags, {
      ownKeys() {
        ownKeyReads += 1;
        throw new Error("array ownKeys trap must not execute");
      },
    });

    const result = parseExperiencePackManifest(input);
    expect(ownKeyReads).toBe(0);
    expect(namedReads).toBe(0);
    expect(result).toMatchObject({ ok: true });
  });

  it("enforces artifact count before enumerating or cloning oversized array entries", () => {
    const input = manifest();
    const oversized = new Array<(typeof input.artifacts)[number]>(EXPERIENCE_PACK_MAX_ARTIFACTS + 1);
    let numericDescriptorReads = 0;
    input.artifacts = new Proxy(oversized, {
      getOwnPropertyDescriptor(target, property) {
        if (typeof property === "string" && /^\d+$/.test(property)) numericDescriptorReads += 1;
        return Reflect.getOwnPropertyDescriptor(target, property);
      },
    });

    const result = parseExperiencePackManifest(input);
    expect(numericDescriptorReads).toBe(0);
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "ARTIFACT_LIMIT_EXCEEDED", path: "$.artifacts" },
    });
  });

  it("does not invoke inherited numeric setters while constructing canonical output arrays", () => {
    const input = manifest();
    const previous = Object.getOwnPropertyDescriptor(Array.prototype, "0");
    let writes = 0;
    let result: ReturnType<typeof parseExperiencePackManifest>;

    try {
      Object.defineProperty(Array.prototype, "0", {
        configurable: true,
        set() {
          writes += 1;
        },
      });
      result = parseExperiencePackManifest(input);
    } finally {
      restoreProperty(Array.prototype, "0", previous);
    }

    expect(writes).toBe(0);
    expect(result).toMatchObject({ ok: true });
  });

  it("rejects accessor-backed and symbol-backed record state fail-closed", () => {
    let reads = 0;
    const accessorInput = manifest();
    Object.defineProperty(accessorInput.publisher, "name", {
      enumerable: true,
      get() {
        reads += 1;
        return "Vira";
      },
    });

    expect(parseExperiencePackManifest(accessorInput)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_PUBLISHER", path: "$.publisher" },
    });
    expect(reads).toBe(0);

    const symbolInput = manifest();
    Object.defineProperty(symbolInput.metadata, Symbol("secret"), { value: true });
    expect(parseExperiencePackManifest(symbolInput)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_METADATA", path: "$.metadata" },
    });
  });
});
