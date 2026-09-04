import { describe, expect, it } from "vitest";
import {
  parseViraApplicationExactReference,
  parseViraApplicationPackage,
  serializeViraApplicationExactReference,
} from "../../packages/application-package/src/index.js";

function applicationWithCapability(versionRef: string) {
  return {
    schemaVersion: "1",
    identity: { id: "vira.reference-test" },
    version: "1.0.0",
    publisher: { id: "vira", name: "Vira" },
    experiences: [],
    capabilities: [{ id: "plan.pro", versionRef }],
    contextTypes: [],
    actions: [],
    flows: [],
    brandRef: null,
    governanceRequirements: [],
    hostCompatibility: { minViraVersion: "1.0.0", requiredCapabilities: [] },
    protocolProjections: [],
    distribution: { name: "Reference Test", tags: [], visibility: "private", discoverable: false },
    commercial: { entitlementRefs: [], meteringRefs: [] },
  };
}

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

  it("keeps package reference validation delegated to the same canonical parser semantics", () => {
    const valid = parseViraApplicationPackage(applicationWithCapability("2026-09+rev.1"));
    expect(valid.ok).toBe(true);

    for (const versionRef of ["latest", "1.x", "1-X"]) {
      const direct = parseViraApplicationExactReference({ id: "plan.pro", versionRef });
      const packageResult = parseViraApplicationPackage(applicationWithCapability(versionRef));
      expect(direct.ok).toBe(false);
      expect(packageResult.ok).toBe(false);
      if (direct.ok || packageResult.ok) continue;
      expect(packageResult.issue.code).toBe(direct.issue.code);
      expect(packageResult.issue.path).toBe("$.capabilities[0].versionRef");
    }
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
