import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { serializeViraApplicationPackageV2 } from "../../packages/application-package/src/index.js";
import {
  createViraApplicationDeploymentPlane,
  type ViraApplicationDeploymentArtifactRecord,
  type ViraApplicationEnvironmentBinding,
  type ViraSignedApplicationDistribution,
} from "../../packages/deployment-plane/src/index.js";
import { createViraApplicationResolver } from "../../packages/application-resolution/src/index.js";

function application(version = "1.2.0") {
  return {
    schemaVersion: "2" as const,
    identity: { id: "vira.flight-assistant" },
    version,
    publisher: { id: "vira", name: "Vira" },
    experiences: [{ id: "travel.flight.search", packId: "vira/flight-booking", packVersion: "2.1.0", entrypoint: "main" }],
    capabilities: [{ id: "travel.flight.search-capability", versionRef: "1" }],
    contextTypes: [{ id: "travel.flight.work-context", versionRef: "1" }],
    actions: [{ id: "travel.flight.book", versionRef: "2026-09-05" }],
    flows: [{ id: "travel.flight.booking-flow", versionRef: "1" }],
    brandRef: { id: "brand.vira", versionRef: "1" },
    governanceRequirements: [{ id: "governance.booking-approval", versionRef: "1" }],
    hostCompatibility: { minViraVersion: "1.0.0", requiredCapabilities: [] as string[] },
    protocolProjections: [{ id: "protocol.mcp-apps", versionRef: "1" }],
    triggers: [{ type: "api" as const, entrypointRef: { id: "travel.flight.booking-flow", versionRef: "1" } }],
    distribution: { name: "Flight Assistant", tags: ["travel"], visibility: "organization" as const, discoverable: true },
    commercial: {
      entitlementRefs: [{ id: "entitlement.flight-assistant", versionRef: "1" }],
      meteringRefs: [{ id: "metering.flight-assistant", versionRef: "1" }],
      pricingRefs: [{ id: "pricing.flight-assistant", versionRef: "1" }],
      settlementRefs: [{ id: "settlement.flight-assistant", versionRef: "1" }],
    },
  };
}

function digest(value: ReturnType<typeof application>): string {
  const serialized = serializeViraApplicationPackageV2(value);
  if (!serialized.ok) throw new Error(serialized.issue.message);
  return createHash("sha256").update(serialized.value).digest("hex");
}

function signed(value = application()): ViraSignedApplicationDistribution {
  return {
    version: "2",
    artifactKind: "application-distribution",
    distribution: { schemaVersion: "2", application: value, integrity: { algorithm: "sha256", digest: digest(value) } },
    provenance: {
      version: "1",
      publisherId: "vira",
      principal: { version: "1", kind: "service", id: "publisher-service", organizationId: "org-vira" },
      authenticationRef: "auth:publisher:1",
    },
    signature: { algorithm: "ed25519", keyId: "key:vira:release-1", value: "abcdefghijklmnop" },
  };
}

function binding(environment: "dev" | "staging" | "production"): ViraApplicationEnvironmentBinding {
  return {
    version: "1",
    bindingRef: `binding:${environment}:1`,
    scope: { version: "1", organizationId: "org-vira", projectId: "flight-project", environment },
    providerIdentityRef: "provider:vira:primary",
    location: "eu-central",
    adapterRef: "adapter:flight:1",
    secretRef: { version: "1", organizationId: "org-vira", projectId: "flight-project", environment, provider: "kms", key: "flight-api" },
    trustStatus: "trusted",
    trustEvidenceRef: "trust:provider:1",
  };
}

async function deployed() {
  const plane = createViraApplicationDeploymentPlane({
    trust: {
      verifyDistributionIntegrity: ({ digest: expected, canonicalArtifact }) => createHash("sha256").update(canonicalArtifact).digest("hex") === expected,
      verifyPublisherProvenance: () => true,
      verifySignature: () => true,
    },
  });
  if (!plane.ok) throw new Error(plane.issue.message);
  const publication = await plane.value.publish({ artifact: signed(), binding: binding("dev") });
  if (!publication.ok) throw new Error(publication.issue.message);
  return { plane: plane.value, publication };
}

function scope(environment: "dev" | "staging" | "production" = "dev") {
  return { version: "1" as const, organizationId: "org-vira", projectId: "flight-project", environment };
}

function acceptCached(artifact: ViraApplicationDeploymentArtifactRecord) {
  return async () => ({ ok: true as const, value: artifact });
}

describe("PROD-05 exact Application resolution", () => {
  it("resolves only the exact active release into an immutable canonical artifact digest", async () => {
    const { plane, publication } = await deployed();
    const resolver = createViraApplicationResolver({ source: plane, digest: (canonical) => createHash("sha256").update(canonical).digest("hex") });
    expect(resolver.ok).toBe(true);
    if (!resolver.ok) return;
    const resolved = await resolver.value.resolve({ release: publication.value.release, scope: scope() });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.artifact.release).toEqual(publication.value.release);
    expect(resolved.value.artifact.deploymentId).toBe(publication.value.deploymentId);
    expect(resolved.value.artifact.binding.bindingRef).toBe("binding:dev:1");
    expect(createHash("sha256").update(resolved.value.canonicalArtifact).digest("hex")).toBe(resolved.value.resolutionDigest);
  });

  it("is deterministic for the same immutable deployment snapshot", async () => {
    const { plane, publication } = await deployed();
    const resolver = createViraApplicationResolver({ source: plane, digest: (value) => createHash("sha256").update(value).digest("hex") });
    expect(resolver.ok).toBe(true);
    if (!resolver.ok) return;
    const first = await resolver.value.resolve({ release: publication.value.release, scope: scope() });
    const second = await resolver.value.resolve({ release: publication.value.release, scope: scope() });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value.canonicalArtifact).toBe(first.value.canonicalArtifact);
    expect(second.value.resolutionDigest).toBe(first.value.resolutionDigest);
  });

  it("rejects floating and inactive release requests", async () => {
    const { plane } = await deployed();
    const resolver = createViraApplicationResolver({ source: plane, digest: () => "a".repeat(64) });
    expect(resolver.ok).toBe(true);
    if (!resolver.ok) return;
    expect(await resolver.value.resolve({ release: { id: "vira.flight-assistant", version: "latest" }, scope: scope() }))
      .toMatchObject({ ok: false, issue: { code: "INVALID_RELEASE" } });
    expect(await resolver.value.resolve({ release: { id: "vira.flight-assistant", version: "9.9.9" }, scope: scope() }))
      .toMatchObject({ ok: false, issue: { code: "APPLICATION_NOT_FOUND" } });
  });

  it("rejects non-canonical scope shapes instead of silently ignoring fields", async () => {
    const { plane, publication } = await deployed();
    const resolver = createViraApplicationResolver({ source: plane, digest: () => "a".repeat(64) });
    expect(resolver.ok).toBe(true);
    if (!resolver.ok) return;
    expect(await resolver.value.resolve({
      release: publication.value.release,
      scope: { ...scope(), admin: true } as never,
    })).toMatchObject({ ok: false, issue: { code: "INVALID_REQUEST" } });
  });

  it("does not leak an active release across enterprise projects", async () => {
    const { plane, publication } = await deployed();
    const resolver = createViraApplicationResolver({ source: plane, digest: () => "a".repeat(64) });
    expect(resolver.ok).toBe(true);
    if (!resolver.ok) return;
    expect(await resolver.value.resolve({ release: publication.value.release, scope: { ...scope(), projectId: "other-project" } }))
      .toMatchObject({ ok: false, issue: { code: "APPLICATION_NOT_FOUND" } });
  });

  it("rejects a deprecated release even while historical deployment evidence remains", async () => {
    const { plane, publication } = await deployed();
    expect((await plane.deprecate({ scope: scope(), release: publication.value.release, distributionDigest: publication.value.distributionDigest })).ok).toBe(true);
    const resolver = createViraApplicationResolver({ source: plane, digest: () => "a".repeat(64) });
    expect(resolver.ok).toBe(true);
    if (!resolver.ok) return;
    const result = await resolver.value.resolve({ release: publication.value.release, scope: scope() });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(["APPLICATION_DEPRECATED", "SOURCE_FAILED"]).toContain(result.issue.code);
  });

  it("fails closed when current publisher/signature trust is revoked after activation", async () => {
    let signatureTrusted = true;
    const plane = createViraApplicationDeploymentPlane({
      trust: {
        verifyDistributionIntegrity: ({ digest: expected, canonicalArtifact }) => createHash("sha256").update(canonicalArtifact).digest("hex") === expected,
        verifyPublisherProvenance: () => true,
        verifySignature: () => signatureTrusted,
      },
    });
    expect(plane.ok).toBe(true);
    if (!plane.ok) return;
    const publication = await plane.value.publish({ artifact: signed(), binding: binding("dev") });
    expect(publication.ok).toBe(true);
    if (!publication.ok) return;
    signatureTrusted = false;
    const resolver = createViraApplicationResolver({ source: plane.value, digest: () => "a".repeat(64) });
    expect(resolver.ok).toBe(true);
    if (!resolver.ok) return;
    expect(await resolver.value.resolve({ release: publication.value.release, scope: scope() }))
      .toMatchObject({ ok: false, issue: { code: "SOURCE_FAILED", deploymentIssue: { code: "SIGNATURE_INVALID" } } });
  });

  it("fails closed on internally inconsistent cached/source deployment data", async () => {
    const { plane, publication } = await deployed();
    const candidate = await plane.lookupActive({ release: publication.value.release, scope: scope() });
    expect(candidate.ok && candidate.value !== null).toBe(true);
    if (!candidate.ok || candidate.value === null) return;
    const conflicted = { artifact: candidate.value.artifact, deployment: { ...candidate.value.deployment, distributionDigest: "f".repeat(64) } };
    const resolver = createViraApplicationResolver({
      source: {
        lookupActive: async () => ({ ok: true as const, value: conflicted }),
        verifyCachedApplication: acceptCached(candidate.value.artifact),
      },
      digest: () => "a".repeat(64),
    });
    expect(resolver.ok).toBe(true);
    if (!resolver.ok) return;
    expect(await resolver.value.resolve({ release: publication.value.release, scope: scope() }))
      .toMatchObject({ ok: false, issue: { code: "SOURCE_CONFLICT" } });
  });

  it("fails closed when the deployment source throws", async () => {
    const resolver = createViraApplicationResolver({
      source: {
        lookupActive: async () => { throw new Error("boom"); },
        verifyCachedApplication: async () => { throw new Error("not reached"); },
      },
      digest: () => "a".repeat(64),
    });
    expect(resolver.ok).toBe(true);
    if (!resolver.ok) return;
    expect(await resolver.value.resolve({ release: { id: "vira.flight-assistant", version: "1.2.0" }, scope: scope() }))
      .toMatchObject({ ok: false, issue: { code: "SOURCE_FAILED" } });
  });

  it("fails closed on invalid or failed resolution digest provider", async () => {
    const { plane, publication } = await deployed();
    const invalid = createViraApplicationResolver({ source: plane, digest: () => "sha256:bad" });
    expect(invalid.ok).toBe(true);
    if (!invalid.ok) return;
    expect(await invalid.value.resolve({ release: publication.value.release, scope: scope() }))
      .toMatchObject({ ok: false, issue: { code: "INVALID_RESOLUTION_DIGEST" } });

    const failed = createViraApplicationResolver({ source: plane, digest: () => { throw new Error("digest down"); } });
    expect(failed.ok).toBe(true);
    if (!failed.ok) return;
    expect(await failed.value.resolve({ release: publication.value.release, scope: scope() }))
      .toMatchObject({ ok: false, issue: { code: "DIGEST_PROVIDER_FAILED" } });
  });

  it("follows rollback without mutating historical release identity", async () => {
    const { plane, publication } = await deployed();
    const second = await plane.publish({ artifact: signed(application("1.3.0")), binding: binding("dev") });
    expect(second.ok).toBe(true);
    expect((await plane.rollback({ scope: scope(), deploymentId: publication.value.deploymentId })).ok).toBe(true);
    const resolver = createViraApplicationResolver({ source: plane, digest: (value) => createHash("sha256").update(value).digest("hex") });
    expect(resolver.ok).toBe(true);
    if (!resolver.ok) return;
    const resolved = await resolver.value.resolve({ release: publication.value.release, scope: scope() });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.artifact.release).toEqual({ id: "vira.flight-assistant", version: "1.2.0" });
    expect(resolved.value.artifact.distributionDigest).toBe(publication.value.distributionDigest);
  });
});
