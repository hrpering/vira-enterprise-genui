import { describe, expect, it } from "vitest";
import {
  parseViraApplicationExactReference,
  serializeViraApplicationExactReference,
} from "../../packages/application-package/src/index.js";

describe("Application exact-reference public API", () => {
  it("parses, freezes and deterministically serializes exact references", () => {
    const input = { id: "plan.pro", versionRef: "2026-09+rev.1" };
    const parsed = parseViraApplicationExactReference(input);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toEqual(input);
    expect(Object.isFrozen(parsed.value)).toBe(true);

    const serialized = serializeViraApplicationExactReference(input);
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) return;
    expect(serialized.value).toBe('{"id":"plan.pro","versionRef":"2026-09+rev.1"}');
    expect(serialized.reference).toEqual(input);
  });

  it("rejects floating aliases, wildcard ranges and malformed shapes", () => {
    for (const versionRef of ["latest", "current", "stable", "head", "main", "next", "1.x", "1-X"]) {
      expect(parseViraApplicationExactReference({ id: "plan.pro", versionRef })).toMatchObject({
        ok: false,
        issue: { code: "FLOATING_REFERENCE" },
      });
    }

    expect(parseViraApplicationExactReference({ id: "plan.pro", versionRef: "1", extra: true })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_REFERENCE" },
    });
    expect(parseViraApplicationExactReference({ id: "not valid", versionRef: "1" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_REFERENCE" },
    });
  });

  it("fails closed on accessor and custom-prototype inputs without invoking getters", () => {
    let getterCalls = 0;
    const malicious: Record<string, unknown> = { versionRef: "1" };
    Object.defineProperty(malicious, "id", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "plan.pro";
      },
    });
    expect(parseViraApplicationExactReference(malicious).ok).toBe(false);
    expect(getterCalls).toBe(0);

    const custom = Object.assign(Object.create({ inherited: true }), { id: "plan.pro", versionRef: "1" });
    expect(parseViraApplicationExactReference(custom).ok).toBe(false);
  });
});
