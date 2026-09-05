import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { serializeViraApplicationPackageV2 } from "../../packages/application-package/src/index.js";
import {
  createViraApplicationDeploymentPlane,
  type ViraApplicationDeploymentTrustProvider,
  type ViraApplicationEnvironmentBinding,
  type ViraSignedApplicationDistribution,
} from "../../packages/deployment-plane/src/index.js";

function application(version = "1.2.0", name = "Flight Assistant") {
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
    hostCompatibility: { minViraVersion: "1.0.0", maxViraVersion: "2.0.0", requiredCapabilities: ["host.date-picker"] },
    protocolProjections: [{ id: "protocol.mcp-apps", versionRef: "1" }],
    triggers: [{ type: "api" as const, entrypointRef: { id: "travel.flight.booking-flow", versionRef: "1" } }],
    distribution: { name, description: "A governed flight application.", tags: ["travel"], visibility: "organization" as const, discoverable: true },
    commercial: {
      entitlementRefs: [{ id: "entitlement.flight-assistant", versionRef: "1" }],
      meteringRefs: [{ id: "metering.flight-assistant", versionRef: "1" }],
      pricingRefs: [{ id: "pricing.flight-assistant", versionRef: "1" }],
      settlementRefs: [{ id: "settlement.flight-assistant", versionRef: "1" }],
    },
  };
}

function applicationDigest(value: ReturnType<typeof application>): string {
  const serialized = serializeViraApplicationPackageV2(value);
  if (!serialized.ok) throw new Error(serialized.issue.message);
  return createHash("sha256").update(serialized.value).digest("hex");
}

function signed(value = application(), publisherId = "vira", authenticationRef = "auth:publisher:1", organizationId = "org-vira"): ViraSignedApplicationDistribution {
  return {
    version: "2",
    artifactKind: "application-distribution",
    distribution: {
      schemaVersion: "2",
      application: value,
      integrity: { algorithm: "sha256", digest: applicationDigest(value) },
    },
    provenance: {
      version: "1",
      publisherId,
      principal: { version: "1", kind: "service", id: "publisher-service", organizationId },
      authenticationRef,
    },
    signature: { algorithm: "ed25519", keyId: "key:vira:release-1", value: "abcdefghijklmnop" },
  };
}

function binding(
  environment: "dev" | "staging" | "production",
  trustStatus: "trusted" | "untrusted" = "trusted",
  organizationId = "org-vira",
  projectId = "flight-project",
): ViraApplicationEnvironmentBinding {
  return {
    version: "1",
    bindingRef: `binding:${organizationId}:${projectId}:${environment}:1`,
    scope: { version: "1", organizationId, projectId, environment },
    providerIdentityRef: "provider:vira:primary",
    location: "eu-central",
    adapterRef: "adapter:flight:1",
    secretRef: { version: "1", organizationId, projectId, environment, provider: "kms", key: "flight-api" },
    trustStatus,
    trustEvidenceRef: "trust:provider:1",
  };
}

function trust(overrides: Partial<ViraApplicationDeploymentTrustProvider> = {}): ViraApplicationDeploymentTrustProvider {
  return {
    verifyDistributionIntegrity: ({ digest, canonicalArtifact }) => createHash("sha256").update(canonicalArtifact).digest("hex") === digest,
    verifyPublisherProvenance: ({ publisherId, authenticationRef }) => publisherId === "vira" && authenticationRef === "auth:publisher:1",
    verifySignature: ({ canonicalAttestation }) => canonicalAttestation.includes('"applicationId":"vira.flight-assistant"'),
    ...overrides,
  };
}

function plane(overrides: Partial<ViraApplicationDeploymentTrustProvider> = {}) {
  return createViraApplicationDeploymentPlane({ trust: trust(overrides) });
}

describe("PROD-05 authenticated Application deployment", () => {
  it("publishes an authenticated exact Application distribution to a tenant dev scope", async () => {
    const created = plane();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const result = await created.value.publish({ artifact: signed(), binding: binding("dev") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.release).toEqual({ id: "vira.flight-assistant", version: "1.2.0" });
    expect(result.value.distributionDigest).toBe(applicationDigest(application()));
    expect(result.value.binding.scope).toEqual({ version: "1", organizationId: "org-vira", projectId: "flight-project", environment: "dev" });
  });

  it("rejects tampered distribution integrity", async () => {
    const created = plane();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const artifact = signed();
    const tampered = { ...artifact, distribution: { ...artifact.distribution, integrity: { algorithm: "sha256" as const, digest: "0".repeat(64) } } };
    expect(await created.value.publish({ artifact: tampered, binding: binding("dev") }))
      .toMatchObject({ ok: false, issue: { code: "DISTRIBUTION_INTEGRITY_FAILED" } });
  });

  it("rejects wrong publisher, unauthenticated provenance, invalid signature, and publisher-org mismatch", async () => {
    const created = plane();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(await created.value.publish({ artifact: signed(application(), "other"), binding: binding("dev") }))
      .toMatchObject({ ok: false, issue: { code: "PUBLISHER_MISMATCH" } });
    expect(await created.value.publish({ artifact: signed(application(), "vira", "auth:wrong"), binding: binding("dev") }))
      .toMatchObject({ ok: false, issue: { code: "PUBLISHER_AUTHENTICATION_FAILED" } });
    expect(await created.value.publish({ artifact: signed(application(), "vira", "auth:publisher:1", "org-other"), binding: binding("dev") }))
      .toMatchObject({ ok: false, issue: { code: "PUBLISHER_MISMATCH" } });

    const badSignature = plane({ verifySignature: () => false });
    expect(badSignature.ok).toBe(true);
    if (!badSignature.ok) return;
    expect(await badSignature.value.publish({ artifact: signed(), binding: binding("dev") }))
      .toMatchObject({ ok: false, issue: { code: "SIGNATURE_INVALID" } });
  });

  it("enforces immutable Application id/version to one authenticated release artifact", async () => {
    const created = plane();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect((await created.value.publish({ artifact: signed(), binding: binding("dev") })).ok).toBe(true);
    expect(await created.value.publish({ artifact: signed(application("1.2.0", "Changed Flight Assistant")), binding: binding("dev") }))
      .toMatchObject({ ok: false, issue: { code: "ARTIFACT_CONFLICT" } });
  });

  it("allows only adjacent exact release promotion inside the same tenant lineage", async () => {
    const created = plane();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const artifact = signed();
    expect((await created.value.publish({ artifact, binding: binding("dev") })).ok).toBe(true);
    const release = { id: "vira.flight-assistant", version: "1.2.0" };
    const distributionDigest = artifact.distribution.integrity.digest;
    expect(await created.value.promote({ release, distributionDigest, from: "dev", to: "production", binding: binding("production") }))
      .toMatchObject({ ok: false, issue: { code: "INVALID_PROMOTION" } });
    expect((await created.value.promote({ release, distributionDigest, from: "dev", to: "staging", binding: binding("staging") })).ok).toBe(true);
    expect((await created.value.promote({ release, distributionDigest, from: "staging", to: "production", binding: binding("production") })).ok).toBe(true);
    expect(await created.value.promote({ release, distributionDigest, from: "dev", to: "staging", binding: binding("staging", "trusted", "org-other") }))
      .toMatchObject({ ok: false, issue: { code: "ARTIFACT_NOT_FOUND" } });
  });

  it("rolls back only to exact historical state in the same enterprise scope", async () => {
    const created = plane();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const first = await created.value.publish({ artifact: signed(application("1.2.0")), binding: binding("dev") });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect((await created.value.publish({ artifact: signed(application("1.3.0")), binding: binding("dev") })).ok).toBe(true);
    const rollback = await created.value.rollback({ scope: binding("dev").scope, deploymentId: first.value.deploymentId });
    expect(rollback.ok).toBe(true);
    if (!rollback.ok) return;
    expect(rollback.value.release).toEqual(first.value.release);
    expect(rollback.value.distributionDigest).toBe(first.value.distributionDigest);
    expect(rollback.value.binding.bindingRef).toBe(first.value.binding.bindingRef);
    expect(await created.value.rollback({ scope: binding("dev", "trusted", "org-vira", "other-project").scope, deploymentId: first.value.deploymentId }))
      .toMatchObject({ ok: false, issue: { code: "INVALID_ROLLBACK" } });
  });

  it("isolates active deployments for the same Application across tenant projects", async () => {
    const created = plane();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const artifact = signed();
    expect((await created.value.publish({ artifact, binding: binding("dev", "trusted", "org-vira", "flight-project") })).ok).toBe(true);
    expect((await created.value.publish({ artifact, binding: binding("dev", "trusted", "org-vira", "other-project") })).ok).toBe(true);
    const release = { id: "vira.flight-assistant", version: "1.2.0" };
    const first = await created.value.lookupActive({ release, scope: binding("dev", "trusted", "org-vira", "flight-project").scope });
    const second = await created.value.lookupActive({ release, scope: binding("dev", "trusted", "org-vira", "other-project").scope });
    expect(first.ok && first.value !== null).toBe(true);
    expect(second.ok && second.value !== null).toBe(true);
    if (!first.ok || first.value === null || !second.ok || second.value === null) return;
    expect(first.value.deployment.binding.scope.projectId).toBe("flight-project");
    expect(second.value.deployment.binding.scope.projectId).toBe("other-project");
    expect(first.value.deployment.deploymentId).not.toBe(second.value.deployment.deploymentId);
  });

  it("rejects cross-scope and untrusted environment bindings", async () => {
    const created = plane();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const crossScope = binding("dev");
    const bad = { ...crossScope, secretRef: { ...crossScope.secretRef, projectId: "other-project" } };
    expect(await created.value.publish({ artifact: signed(), binding: bad }))
      .toMatchObject({ ok: false, issue: { code: "INVALID_BINDING" } });
    expect(await created.value.publish({ artifact: signed(), binding: binding("dev", "untrusted") }))
      .toMatchObject({ ok: false, issue: { code: "UNTRUSTED_BINDING" } });
  });

  it("deprecation blocks promotion, rollback target and cached artifact acceptance", async () => {
    const created = plane();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const artifact = signed();
    const published = await created.value.publish({ artifact, binding: binding("dev") });
    expect(published.ok).toBe(true);
    if (!published.ok) return;
    const release = { release: published.value.release, distributionDigest: published.value.distributionDigest };
    expect((await created.value.deprecate({ scope: published.value.binding.scope, ...release })).ok).toBe(true);
    expect(await created.value.promote({ ...release, from: "dev", to: "staging", binding: binding("staging") }))
      .toMatchObject({ ok: false, issue: { code: "ARTIFACT_DEPRECATED" } });
    expect(await created.value.rollback({ scope: published.value.binding.scope, deploymentId: published.value.deploymentId }))
      .toMatchObject({ ok: false, issue: { code: "ARTIFACT_DEPRECATED" } });
    expect(await created.value.verifyCachedApplication({ scope: published.value.binding.scope, artifact }))
      .toMatchObject({ ok: false, issue: { code: "ARTIFACT_DEPRECATED" } });
  });
});
