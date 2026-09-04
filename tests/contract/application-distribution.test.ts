import { describe, expect, it } from "vitest";
import { serializeViraApplicationPackage } from "../../packages/application-package/src/index.js";
import {
  parseViraApplicationDistributionEnvelope,
  serializeViraApplicationDistributionEnvelope,
  verifyViraApplicationDistributionIntegrity,
} from "../../packages/application-distribution/src/index.js";
import type { ViraApplicationDistributionVerifierInput } from "../../packages/application-distribution/src/index.js";

const DIGEST = "a".repeat(64);

function application() {
  return {
    schemaVersion: "1",
    identity: { id: "vira.flight-assistant" },
    version: "1.2.0",
    publisher: { id: "vira", name: "Vira" },
    experiences: [{
      id: "travel.flight.search",
      packId: "vira/flight-booking",
      packVersion: "2.1.0",
      entrypoint: "main",
    }],
    capabilities: [{ id: "travel.flight.search-capability", versionRef: "1" }],
    contextTypes: [{ id: "travel.flight.work-context", versionRef: "1" }],
    actions: [{ actionType: "travel.flight.book" }],
    flows: [{ id: "travel.flight.booking-flow", versionRef: "1" }],
    brandRef: { id: "brand.vira", versionRef: "1" },
    governanceRequirements: [{ id: "governance.booking-approval", versionRef: "1" }],
    hostCompatibility: {
      minViraVersion: "1.0.0",
      maxViraVersion: "2.0.0",
      requiredCapabilities: ["host.date-picker"],
    },
    protocolProjections: [{ id: "protocol.mcp-apps", versionRef: "1" }],
    distribution: {
      name: "Flight Assistant",
      description: "A governed flight application.",
      tags: ["travel", "booking"],
      visibility: "public",
      discoverable: true,
    },
    commercial: {
      entitlementRefs: [{ id: "entitlement.flight-assistant", versionRef: "1" }],
      meteringRefs: [{ id: "metering.flight-assistant", versionRef: "1" }],
    },
  };
}

function envelope() {
  return {
    schemaVersion: "1",
    application: application(),
    integrity: { algorithm: "sha256", digest: DIGEST },
  };
}

describe("Vira Application Distribution v1", () => {
  it("parses a canonical Application release into detached frozen distribution data", () => {
    const input = envelope();
    const result = parseViraApplicationDistributionEnvelope(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).not.toBe(input);
    expect(result.value.application).not.toBe(input.application);
    expect(result.value.application.identity.id).toBe("vira.flight-assistant");
    expect(result.value.application.distribution.visibility).toBe("public");
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.integrity)).toBe(true);
    expect(Object.isFrozen(result.value.application)).toBe(true);
  });

  it("delegates Application semantic validation and preserves the canonical failure code", () => {
    const input = envelope();
    input.application.version = "latest";
    expect(parseViraApplicationDistributionEnvelope(input)).toMatchObject({
      ok: false,
      issue: {
        code: "INVALID_APPLICATION",
        applicationCode: "INVALID_VERSION",
        path: "$.application.version",
      },
    });
  });

  it("does not duplicate discovery, protocol or compatibility semantics outside the Application package", () => {
    for (const field of ["distribution", "protocolProjections", "hostCompatibility", "publisher"]) {
      expect(parseViraApplicationDistributionEnvelope({ ...envelope(), [field]: {} })).toMatchObject({
        ok: false,
        issue: { code: "UNKNOWN_FIELD", path: `$.${field}` },
      });
    }
  });

  it("rejects transport, provider, credential and execution authority smuggling", () => {
    for (const field of ["url", "endpoint", "transport", "provider", "credential", "execute", "authorize", "deploy"]) {
      expect(parseViraApplicationDistributionEnvelope({ ...envelope(), [field]: "forbidden" })).toMatchObject({
        ok: false,
        issue: { code: "UNKNOWN_FIELD", path: `$.${field}` },
      });
    }
  });

  it("rejects authority smuggling inside the canonical Application payload", () => {
    expect(parseViraApplicationDistributionEnvelope({
      ...envelope(),
      application: { ...application(), endpoint: "https://provider.invalid" },
    })).toMatchObject({
      ok: false,
      issue: {
        code: "INVALID_APPLICATION",
        applicationCode: "UNKNOWN_FIELD",
        path: "$.application.endpoint",
      },
    });
  });

  it("requires one exact lowercase sha256 integrity identity", () => {
    expect(parseViraApplicationDistributionEnvelope({
      ...envelope(),
      integrity: { algorithm: "sha512", digest: DIGEST },
    })).toMatchObject({ ok: false, issue: { code: "INVALID_INTEGRITY", path: "$.integrity.algorithm" } });

    expect(parseViraApplicationDistributionEnvelope({
      ...envelope(),
      integrity: { algorithm: "sha256", digest: "A".repeat(64) },
    })).toMatchObject({ ok: false, issue: { code: "INVALID_INTEGRITY", path: "$.integrity.digest" } });

    expect(parseViraApplicationDistributionEnvelope({
      ...envelope(),
      integrity: { algorithm: "sha256", digest: "a".repeat(63) },
    })).toMatchObject({ ok: false, issue: { code: "INVALID_INTEGRITY", path: "$.integrity.digest" } });
  });

  it("rejects unknown integrity fields instead of accepting verification/provider hints", () => {
    expect(parseViraApplicationDistributionEnvelope({
      ...envelope(),
      integrity: { algorithm: "sha256", digest: DIGEST, verified: true },
    })).toMatchObject({
      ok: false,
      issue: { code: "UNKNOWN_FIELD", path: "$.integrity.verified" },
    });
  });

  it("serializes deterministically while delegating canonical Application serialization", () => {
    const first = serializeViraApplicationDistributionEnvelope(envelope());
    const second = serializeViraApplicationDistributionEnvelope({
      integrity: { digest: DIGEST, algorithm: "sha256" },
      application: application(),
      schemaVersion: "1",
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value).toBe(second.value);

    const canonicalApplication = serializeViraApplicationPackage(application());
    expect(canonicalApplication.ok).toBe(true);
    if (!canonicalApplication.ok) return;
    expect(first.value).toContain(`"application":${canonicalApplication.value}`);
  });

  it("verifies integrity against the canonical Application artifact, not the envelope bytes", async () => {
    const canonicalApplication = serializeViraApplicationPackage(application());
    expect(canonicalApplication.ok).toBe(true);
    if (!canonicalApplication.ok) return;

    let observed: unknown = null;
    const result = await verifyViraApplicationDistributionIntegrity(
      envelope(),
      (input: ViraApplicationDistributionVerifierInput) => {
        observed = input;
        return true;
      },
    );
    expect(result.ok).toBe(true);
    expect(observed).toEqual({
      algorithm: "sha256",
      digest: DIGEST,
      canonicalArtifact: canonicalApplication.value,
    });
    expect(Object.isFrozen(observed)).toBe(true);
  });

  it("fails closed when integrity verification returns false", async () => {
    await expect(verifyViraApplicationDistributionIntegrity(envelope(), () => false)).resolves.toMatchObject({
      ok: false,
      issue: { code: "INTEGRITY_VERIFICATION_FAILED", path: "$.integrity.digest" },
    });
  });

  it("fails closed when the verifier throws or is absent", async () => {
    await expect(verifyViraApplicationDistributionIntegrity(envelope(), () => {
      throw new Error("provider failure");
    })).resolves.toMatchObject({
      ok: false,
      issue: { code: "INTEGRITY_VERIFIER_FAILED", path: "$verifier" },
    });

    await expect(verifyViraApplicationDistributionIntegrity(envelope(), null)).resolves.toMatchObject({
      ok: false,
      issue: { code: "INVALID_VERIFIER", path: "$verifier" },
    });
  });

  it("fails closed on unsafe accessors and custom-prototype inputs", () => {
    const accessor = envelope() as Record<string, unknown>;
    Object.defineProperty(accessor, "transport", {
      enumerable: true,
      get() {
        throw new Error("must not execute");
      },
    });
    expect(parseViraApplicationDistributionEnvelope(accessor)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT" },
    });

    const custom = Object.assign(Object.create({ inherited: true }) as Record<string, unknown>, envelope());
    expect(parseViraApplicationDistributionEnvelope(custom)).toMatchObject({
      ok: false,
      issue: { code: "INVALID_INPUT" },
    });
  });

  it("treats prototype-sensitive names as inert data and rejects them by exact shape", () => {
    const polluted = JSON.parse(`{"schemaVersion":"1","application":${JSON.stringify(application())},"integrity":{"algorithm":"sha256","digest":"${DIGEST}"},"__proto__":{"polluted":true}}`) as unknown;
    expect(parseViraApplicationDistributionEnvelope(polluted)).toMatchObject({
      ok: false,
      issue: { code: "UNKNOWN_FIELD", path: "$.__proto__" },
    });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
