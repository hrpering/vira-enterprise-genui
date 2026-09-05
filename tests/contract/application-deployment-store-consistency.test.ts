import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { serializeViraApplicationPackageV2 } from "../../packages/application-package/src/index.js";
import {
  createViraApplicationDeploymentPlane,
  type ViraApplicationDeploymentArtifactRecord,
  type ViraApplicationDeploymentStateStore,
  type ViraSignedApplicationDistribution,
} from "../../packages/deployment-plane/src/index.js";

function application() {
  return {
    schemaVersion: "2" as const,
    identity: { id: "vira.flight-assistant" },
    version: "1.2.0",
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

function distributionDigest(): string {
  const serialized = serializeViraApplicationPackageV2(application());
  if (!serialized.ok) throw new Error(serialized.issue.message);
  return createHash("sha256").update(serialized.value).digest("hex");
}

function signed(): ViraSignedApplicationDistribution {
  const value = application();
  return {
    version: "2",
    artifactKind: "application-distribution",
    distribution: {
      schemaVersion: "2",
      application: value,
      integrity: { algorithm: "sha256", digest: distributionDigest() },
    },
    provenance: {
      version: "1",
      publisherId: "vira",
      principal: { version: "1", kind: "service", id: "publisher-service", organizationId: "org-vira" },
      authenticationRef: "auth:publisher:1",
    },
    signature: { algorithm: "ed25519", keyId: "key:vira:release-1", value: "abcdefghijklmnop" },
  };
}

function canonicalArtifact(input: ViraSignedApplicationDistribution): ViraApplicationDeploymentArtifactRecord {
  const release = { id: input.distribution.application.identity.id, version: input.distribution.application.version };
  return Object.freeze({
    artifactId: `application-artifact:${release.id}:${release.version}:${input.distribution.integrity.digest}`,
    artifactKind: "application-distribution",
    release: Object.freeze(release),
    distributionDigest: input.distribution.integrity.digest,
    publisherId: input.provenance.publisherId,
    distribution: input.distribution,
    provenance: input.provenance,
    signature: input.signature,
    status: "active",
  });
}

describe("PROD-05 deployment store consistency", () => {
  it("rejects a store artifact whose release identity disagrees with its authenticated signed artifact", async () => {
    const authenticated = signed();
    const expected = canonicalArtifact(authenticated);
    const corrupted = Object.freeze({
      ...expected,
      release: Object.freeze({ id: expected.release.id, version: "9.9.9" }),
    });

    const store: ViraApplicationDeploymentStateStore = {
      registerArtifact: async ({ artifact }) => ({ ok: true, value: artifact }),
      getArtifact: async () => ({ ok: true, value: Object.freeze({ artifact: corrupted, signed: authenticated }) }),
      setArtifactStatus: async () => ({ ok: true, value: corrupted }),
      getActive: async () => ({ ok: true, value: null }),
      getHistorical: async () => ({ ok: true, value: null }),
      commitDeployment: async ({ deployment }) => ({ ok: true, value: deployment }),
      inspect: async () => ({
        ok: true,
        value: Object.freeze({ artifacts: Object.freeze([corrupted]), deployments: Object.freeze([]), history: Object.freeze([]) }),
      }),
    };

    const plane = createViraApplicationDeploymentPlane({
      trust: {
        verifyDistributionIntegrity: ({ digest, canonicalArtifact: canonical }) => createHash("sha256").update(canonical).digest("hex") === digest,
        verifyPublisherProvenance: () => true,
        verifySignature: () => true,
      },
      store,
    });
    expect(plane.ok).toBe(true);
    if (!plane.ok) return;

    const result = await plane.value.verifyCachedApplication({
      scope: { version: "1", organizationId: "org-vira", projectId: "flight-project", environment: "dev" },
      artifact: authenticated,
    });

    expect(result).toMatchObject({ ok: false, issue: { code: "ARTIFACT_CONFLICT" } });
  });
});
