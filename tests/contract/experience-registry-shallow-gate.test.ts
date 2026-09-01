import { describe, expect, it } from "vitest";
import {
  EXPERIENCE_REGISTRY_MAX_MANIFESTS,
  parseExperienceRegistrySnapshot,
} from "../../packages/experience-registry/src/index.js";

function restoreProperty(target: object, key: PropertyKey, previous: PropertyDescriptor | undefined): void {
  if (previous) {
    Object.defineProperty(target, key, previous);
  } else {
    Reflect.deleteProperty(target, key);
  }
}

describe("Experience Registry shallow wrapper gates", () => {
  it("rejects unsupported wrapper fields before detaching nested graph state", () => {
    const input = JSON.stringify({
      schemaVersion: "1",
      manifests: [],
      unsupported: [[[{ nested: true }]]],
    });
    const previous = Object.getOwnPropertyDescriptor(Object, "setPrototypeOf");
    let detachCalls = 0;
    let result: ReturnType<typeof parseExperienceRegistrySnapshot>;

    try {
      Object.defineProperty(Object, "setPrototypeOf", {
        configurable: true,
        writable: true,
        value() {
          detachCalls += 1;
          throw new Error("deep detachment must not start before wrapper validation");
        },
      });
      result = parseExperienceRegistrySnapshot(input);
    } finally {
      restoreProperty(Object, "setPrototypeOf", previous);
    }

    expect(detachCalls).toBe(0);
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "UNKNOWN_FIELD", path: "$" },
    });
  });

  it("rejects manifest-count overflow before detaching any manifest graph", () => {
    const manifests = new Array<null>(EXPERIENCE_REGISTRY_MAX_MANIFESTS + 1).fill(null);
    const input = JSON.stringify({ schemaVersion: "1", manifests });
    const previous = Object.getOwnPropertyDescriptor(Object, "setPrototypeOf");
    let detachCalls = 0;
    let result: ReturnType<typeof parseExperienceRegistrySnapshot>;

    try {
      Object.defineProperty(Object, "setPrototypeOf", {
        configurable: true,
        writable: true,
        value() {
          detachCalls += 1;
          throw new Error("manifest detachment must not start before count validation");
        },
      });
      result = parseExperienceRegistrySnapshot(input);
    } finally {
      restoreProperty(Object, "setPrototypeOf", previous);
    }

    expect(detachCalls).toBe(0);
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "MANIFEST_LIMIT_EXCEEDED", path: "$.manifests" },
    });
  });

  it("rejects structural-container amplification before JSON.parse materializes the graph", () => {
    const tinyObjects = `${"{},".repeat(100_001)}{}`;
    const input = `{"schemaVersion":"1","manifests":[{"unknown":[${tinyObjects}]}]}`;
    const previous = Object.getOwnPropertyDescriptor(JSON, "parse");
    let parseCalls = 0;
    let result: ReturnType<typeof parseExperienceRegistrySnapshot>;

    try {
      Object.defineProperty(JSON, "parse", {
        configurable: true,
        writable: true,
        value() {
          parseCalls += 1;
          throw new Error("over-budget JSON must be rejected before parsing");
        },
      });
      result = parseExperienceRegistrySnapshot(input);
    } finally {
      restoreProperty(JSON, "parse", previous);
    }

    expect(parseCalls).toBe(0);
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT", path: "$" },
    });
  });

  it("rejects primitive-array structural amplification before JSON.parse materializes the graph", () => {
    const primitiveValues = `${"0,".repeat(500_001)}0`;
    const input = `{"schemaVersion":"1","manifests":[{"unknown":[${primitiveValues}]}]}`;
    const previous = Object.getOwnPropertyDescriptor(JSON, "parse");
    let parseCalls = 0;
    let result: ReturnType<typeof parseExperienceRegistrySnapshot>;

    try {
      Object.defineProperty(JSON, "parse", {
        configurable: true,
        writable: true,
        value() {
          parseCalls += 1;
          throw new Error("over-budget primitive JSON must be rejected before parsing");
        },
      });
      result = parseExperienceRegistrySnapshot(input);
    } finally {
      restoreProperty(JSON, "parse", previous);
    }

    expect(parseCalls).toBe(0);
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT", path: "$" },
    });
  });

  it("does not count structural characters inside JSON strings", () => {
    const marker = "{[,:".repeat(125_001);
    const input = JSON.stringify({
      schemaVersion: "1",
      manifests: [{ unknown: marker }],
    });

    expect(parseExperienceRegistrySnapshot(input)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_MANIFEST", path: "$.manifests[0]" },
    });
  });

  it("uses the captured JSON.parse intrinsic after ambient mutation", () => {
    const input = '{"schemaVersion":"1","manifests":[]}';
    const previous = Object.getOwnPropertyDescriptor(JSON, "parse");
    let ambientParseCalls = 0;
    let result: ReturnType<typeof parseExperienceRegistrySnapshot>;

    try {
      Object.defineProperty(JSON, "parse", {
        configurable: true,
        writable: true,
        value() {
          ambientParseCalls += 1;
          throw new Error("ambient JSON.parse must not control Registry parsing");
        },
      });
      result = parseExperienceRegistrySnapshot(input);
    } finally {
      restoreProperty(JSON, "parse", previous);
    }

    expect(ambientParseCalls).toBe(0);
    expect(result).toMatchObject({ ok: true });
  });
});
