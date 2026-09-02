import { describe, expect, it } from "vitest";
import {
  createStudioHostCapabilityManifest,
  createStudioHostCompatibilityRequirement,
  evaluateStudioHostCompatibility,
  STUDIO_HOST_MAX_CAPABILITIES,
  STUDIO_HOST_MAX_IMPLEMENTATION_IDS,
  STUDIO_HOST_PLATFORMS,
} from "../../packages/studio-host/src/index.js";
import { jsonRoundTrip } from "../helpers/index.js";

function capability(id: string) {
  return { version: "1", id } as const;
}

function manifest(platform: "web" | "ios" | "android" = "web") {
  return {
    version: "1",
    id: `vira.host.${platform}.reference`,
    platform,
    implementationIds: [
      `alpha.catalog.${platform}.card.v1`,
      `alpha.catalog.${platform}.badge.v1`,
    ],
    capabilities: [
      capability("vira.capability.forms"),
      capability("vira.capability.navigation"),
    ],
  };
}

function requirement(platform: "web" | "ios" | "android" = "web") {
  return {
    version: "1",
    platform,
    implementationIds: [`alpha.catalog.${platform}.card.v1`],
    capabilities: [capability("vira.capability.forms")],
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

describe("MASTER-04 Studio Host Capability Manifest", () => {
  it("uses one immutable JSON-round-trippable manifest contract for web, iOS, and Android", () => {
    expect(STUDIO_HOST_PLATFORMS).toEqual(["web", "ios", "android"]);

    for (const platform of STUDIO_HOST_PLATFORMS) {
      const result = createStudioHostCapabilityManifest(manifest(platform));
      expect(result, platform).toMatchObject({ ok: true, value: { platform } });
      if (!result.ok) continue;
      expect(Object.isFrozen(result.value)).toBe(true);
      expect(Object.isFrozen(result.value.implementationIds)).toBe(true);
      expect(Object.isFrozen(result.value.capabilities)).toBe(true);
      expect(result.value.capabilities.every((entry) => Object.isFrozen(entry))).toBe(true);
      expect(jsonRoundTrip(result.value)).toEqual(result.value);
    }
  });

  it("fails closed on unknown backend, secret, executable, and fallback fields", () => {
    for (const extra of [
      { endpoint: "https://customer.example/api" },
      { apiKey: "secret" },
      { renderer: "alpha.catalog.web.card.v1" },
      { fallback: "alpha.catalog.web.card.v0" },
    ]) {
      expect(createStudioHostCapabilityManifest({ ...manifest(), ...extra })).toMatchObject({
        ok: false,
        issue: { code: "UNKNOWN_FIELD" },
      });
    }

    expect(createStudioHostCompatibilityRequirement({
      ...requirement(),
      fallback: { implementationIds: ["alpha.catalog.web.card.v0"] },
    })).toMatchObject({
      ok: false,
      issue: { code: "UNKNOWN_FIELD", path: "$.fallback" },
    });
  });

  it("rejects accessor-backed manifest data without evaluating the getter", () => {
    let calls = 0;
    const input: Record<string, unknown> = {
      version: "1",
      id: "vira.host.web.reference",
      platform: "web",
      capabilities: [],
    };
    Object.defineProperty(input, "implementationIds", {
      enumerable: true,
      get() {
        calls += 1;
        return ["alpha.catalog.web.card.v1"];
      },
    });
    expect(createStudioHostCapabilityManifest(input)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_TYPE", path: "$.implementationIds" },
    });
    expect(calls).toBe(0);
  });

  it("validates manifest version, host identity, and platform exactly", () => {
    expect(createStudioHostCapabilityManifest({ ...manifest(), version: "2" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_VERSION", path: "$.version" },
    });
    expect(createStudioHostCapabilityManifest({ ...manifest(), id: "host" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_ID", path: "$.id" },
    });
    expect(createStudioHostCapabilityManifest({ ...manifest(), platform: "windows" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_PLATFORM", path: "$.platform" },
    });
  });

  it("rejects URL/path/script-like implementation IDs and duplicate implementation IDs", () => {
    for (const implementationId of [
      "https://evil.example/card.js",
      "javascript:alert(1)",
      "../renderer/card",
      "/absolute/renderer",
      "renderer",
    ]) {
      expect(createStudioHostCapabilityManifest({
        ...manifest(),
        implementationIds: [implementationId],
      }), implementationId).toMatchObject({
        ok: false,
        issue: { code: "INVALID_IMPLEMENTATION_ID", path: "$.implementationIds[0]" },
      });
    }

    const duplicate = manifest();
    duplicate.implementationIds.push(duplicate.implementationIds[0]!);
    expect(createStudioHostCapabilityManifest(duplicate)).toMatchObject({
      ok: false,
      issue: { code: "DUPLICATE_IMPLEMENTATION_ID", path: "$.implementationIds[2]" },
    });
  });

  it("enforces implementation resource limits before accepting the contract", () => {
    const implementationIds = Array.from(
      { length: STUDIO_HOST_MAX_IMPLEMENTATION_IDS + 1 },
      (_, index) => `alpha.catalog.web.component${index}.v1`,
    );
    expect(createStudioHostCapabilityManifest({ ...manifest(), implementationIds })).toMatchObject({
      ok: false,
      issue: { code: "IMPLEMENTATION_LIMIT_EXCEEDED", path: "$.implementationIds" },
    });
    expect(createStudioHostCompatibilityRequirement({ ...requirement(), implementationIds })).toMatchObject({
      ok: false,
      issue: { code: "IMPLEMENTATION_LIMIT_EXCEEDED", path: "$.implementationIds" },
    });
  });

  it("delegates capability validation to the canonical protocol contract and rejects duplicates", () => {
    expect(createStudioHostCapabilityManifest({
      ...manifest(),
      capabilities: [{ version: "2", id: "vira.capability.forms" }],
    })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_CAPABILITY", path: "$.capabilities[0].version" },
    });

    expect(createStudioHostCapabilityManifest({
      ...manifest(),
      capabilities: [capability("vira.capability.forms"), capability("vira.capability.forms")],
    })).toMatchObject({
      ok: false,
      issue: { code: "DUPLICATE_CAPABILITY", path: "$.capabilities[1]" },
    });
  });

  it("enforces capability resource limits for both manifests and requirements", () => {
    const capabilities = Array.from(
      { length: STUDIO_HOST_MAX_CAPABILITIES + 1 },
      (_, index) => capability(`vira.capability.feature${index}`),
    );
    expect(createStudioHostCapabilityManifest({ ...manifest(), capabilities })).toMatchObject({
      ok: false,
      issue: { code: "CAPABILITY_LIMIT_EXCEEDED", path: "$.capabilities" },
    });
    expect(createStudioHostCompatibilityRequirement({ ...requirement(), capabilities })).toMatchObject({
      ok: false,
      issue: { code: "CAPABILITY_LIMIT_EXCEEDED", path: "$.capabilities" },
    });
  });

  it("validates host-scoped requirements independently of planner capability requirements", () => {
    const result = createStudioHostCompatibilityRequirement(requirement("ios"));
    expect(result).toMatchObject({ ok: true, value: { platform: "ios" } });
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.implementationIds)).toBe(true);
    expect(Object.isFrozen(result.value.capabilities)).toBe(true);
    expect(jsonRoundTrip(result.value)).toEqual(result.value);

    expect(createStudioHostCompatibilityRequirement({ ...requirement(), version: "2" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_VERSION", path: "$.version" },
    });
    expect(createStudioHostCompatibilityRequirement({ ...requirement(), platform: "desktop" })).toMatchObject({
      ok: false,
      issue: { code: "INVALID_PLATFORM", path: "$.platform" },
    });
  });

  it("accepts exact support and requirement subsets while ignoring extra host support", () => {
    expect(evaluateStudioHostCompatibility(manifest(), requirement())).toEqual({
      ok: true,
      value: { compatible: true, mismatches: [] },
    });

    const emptyRequirement = { ...requirement(), implementationIds: [], capabilities: [] };
    expect(evaluateStudioHostCompatibility(manifest(), emptyRequirement)).toEqual({
      ok: true,
      value: { compatible: true, mismatches: [] },
    });
  });

  it("fails closed deterministically for platform, implementation, and capability mismatches", () => {
    const unsupported = {
      version: "1",
      platform: "ios",
      implementationIds: [
        "alpha.catalog.ios.card.v1",
        "alpha.catalog.ios.badge.v1",
      ],
      capabilities: [
        capability("vira.capability.forms"),
        capability("vira.capability.camera"),
      ],
    } as const;

    expect(evaluateStudioHostCompatibility(manifest("web"), unsupported)).toEqual({
      ok: true,
      value: {
        compatible: false,
        mismatches: [
          { code: "PLATFORM_MISMATCH", path: "$.requirement.platform" },
          { code: "MISSING_IMPLEMENTATION", path: "$.requirement.implementationIds[0]" },
          { code: "MISSING_IMPLEMENTATION", path: "$.requirement.implementationIds[1]" },
          { code: "MISSING_CAPABILITY", path: "$.requirement.capabilities[1]" },
        ],
      },
    });
  });

  it("does not use prefix, wildcard, or cross-platform near matches", () => {
    const host = manifest("web");
    expect(evaluateStudioHostCompatibility(host, {
      ...requirement("web"),
      implementationIds: ["alpha.catalog.web.card"],
    })).toMatchObject({
      ok: true,
      value: {
        compatible: false,
        mismatches: [{ code: "MISSING_IMPLEMENTATION" }],
      },
    });

    expect(evaluateStudioHostCompatibility(host, {
      ...requirement("web"),
      implementationIds: ["alpha.catalog.ios.card.v1"],
    })).toMatchObject({
      ok: true,
      value: {
        compatible: false,
        mismatches: [{ code: "MISSING_IMPLEMENTATION" }],
      },
    });
  });

  it("reports malformed evaluator inputs separately from valid incompatibility", () => {
    expect(evaluateStudioHostCompatibility({ ...manifest(), apiKey: "secret" }, requirement())).toMatchObject({
      ok: false,
      issue: { stage: "manifest", code: "UNKNOWN_FIELD", path: "$.manifest.apiKey" },
    });
    expect(evaluateStudioHostCompatibility(manifest(), { ...requirement(), fallback: "invented" })).toMatchObject({
      ok: false,
      issue: { stage: "requirement", code: "UNKNOWN_FIELD", path: "$.requirement.fallback" },
    });
  });
});
