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
});
