import { describe, expect, it } from "vitest";
import { parseExperienceRegistrySnapshot } from "../../packages/experience-registry/src/index.js";

const TEST_DEFINE_PROPERTY = Object.defineProperty;
const TEST_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const TEST_DELETE_PROPERTY = Reflect.deleteProperty;

function restoreProperty(target: object, key: PropertyKey, previous: PropertyDescriptor | undefined): void {
  if (previous) TEST_DEFINE_PROPERTY(target, key, previous);
  else TEST_DELETE_PROPERTY(target, key);
}

describe("Experience Registry detachment intrinsic hardening", () => {
  it("does not dispatch through post-initialization Array/Object detachment replacements", () => {
    const input = JSON.stringify({ schemaVersion: "1", manifests: [null] });
    const previousArrayIsArray = TEST_GET_OWN_PROPERTY_DESCRIPTOR(Array, "isArray");
    const previousCreate = TEST_GET_OWN_PROPERTY_DESCRIPTOR(Object, "create");
    const previousDefineProperty = TEST_GET_OWN_PROPERTY_DESCRIPTOR(Object, "defineProperty");
    const previousSetPrototypeOf = TEST_GET_OWN_PROPERTY_DESCRIPTOR(Object, "setPrototypeOf");
    let calls = 0;
    let result: ReturnType<typeof parseExperienceRegistrySnapshot>;

    const poison = () => {
      calls += 1;
      throw new Error("ambient detachment intrinsic must not execute");
    };

    try {
      TEST_DEFINE_PROPERTY(Array, "isArray", { configurable: true, writable: true, value: poison });
      TEST_DEFINE_PROPERTY(Object, "create", { configurable: true, writable: true, value: poison });
      TEST_DEFINE_PROPERTY(Object, "defineProperty", { configurable: true, writable: true, value: poison });
      TEST_DEFINE_PROPERTY(Object, "setPrototypeOf", { configurable: true, writable: true, value: poison });
      result = parseExperienceRegistrySnapshot(input);
    } finally {
      restoreProperty(Array, "isArray", previousArrayIsArray);
      restoreProperty(Object, "create", previousCreate);
      restoreProperty(Object, "defineProperty", previousDefineProperty);
      restoreProperty(Object, "setPrototypeOf", previousSetPrototypeOf);
    }

    expect(calls).toBe(0);
    expect(result).toMatchObject({
      ok: false,
      issue: { code: "INVALID_MANIFEST", path: "$.manifests[0]" },
    });
  });
});
