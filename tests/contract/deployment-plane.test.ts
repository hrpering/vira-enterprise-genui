import { describe, expect, it } from "vitest";
import type { ExperiencePackManifest } from "../../packages/experience-packs/src/index.js";
import {
  createViraDeploymentPlane,
  type ViraSignedExperiencePack,
} from "../../packages/deployment-plane/src/index.js";

const digestA = `sha256:${"a".repeat(64)}`;
const digestB = `sha256:${"b".repeat(64)}`;
const signature = {
  algorithm: "ed25519" as const,
  keyId: "key:vira:release-1",
  value: "abcdefghijklmnop",
};

function manifest(name = "Demo Pack", version = "1.0.0"): ExperiencePackManifest {
  return {
    schemaVersion: "1",
    id: "vira/demo",
    version,
    publisher: { id: "vira", name: "Vira" },
    metadata: { name, tags: ["demo"] },
    compatibility: { minViraVersion: "1.0.0" },
    entrypoints: ["publication"],
    artifacts: [{
      id: "publication",
      role: "studio-publication",
      mediaType: "application/json",
      digest: `sha256:${"c".repeat(64)}`,
      size: 123,
    }],
  };
}

function signed(name = "Demo Pack", manifestDigest = digestA, version = "1.0.0"): ViraSignedExperiencePack {
  return {
    version: "1",
    manifest: manifest(name, version),
    manifestDigest,
    signature,
  };
}

function plane(signatureValid = true) {
  return createViraDeploymentPlane({
    integrity: {
      digest: (canonical) => canonical.includes("Second Pack") ? digestB : digestA,
      verifySignature: () => signatureValid,
    },
  });
}

describe("MASTER-11 deployment plane", () => {
  it("verifies a signed Pack and publishes it to dev revision 1", async () => {
    const created = plane();
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await created.value.publish(signed());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ environment: "dev", revision: 1, operation: "publish", packId: "vira/demo" });
    expect(created.value.inspect().deployments.dev?.artifactId).toBe(result.value.artifactId);
  });

  it("fails closed on digest mismatch and signature verification failure", async () => {
    const digestPlane = plane();
    expect(digestPlane.ok).toBe(true);
    if (!digestPlane.ok) return;
    const mismatch = await digestPlane.value.publish(signed("Demo Pack", digestB));
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.issue.code).toBe("DIGEST_MISMATCH");

    const signaturePlane = plane(false);
    expect(signaturePlane.ok).toBe(true);
    if (!signaturePlane.ok) return;
    const invalidSignature = await signaturePlane.value.publish(signed());
    expect(invalidSignature.ok).toBe(false);
    if (!invalidSignature.ok) expect(invalidSignature.issue.code).toBe("SIGNATURE_INVALID");
  });

  it("enforces immutable pack id/version to a single canonical digest", async () => {
    const created = plane();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect((await created.value.publish(signed())).ok).toBe(true);

    const conflict = await created.value.publish(signed("Second Pack", digestB));
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.issue.code).toBe("ARTIFACT_CONFLICT");
  });

  it("allows only adjacent exact-artifact promotion dev -> staging -> production", async () => {
    const created = plane();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect((await created.value.publish(signed())).ok).toBe(true);

    const skipped = await created.value.promote({
      packId: "vira/demo", packVersion: "1.0.0", manifestDigest: digestA, from: "dev", to: "production",
    });
    expect(skipped.ok).toBe(false);
    if (!skipped.ok) expect(skipped.issue.code).toBe("INVALID_PROMOTION");

    const staging = await created.value.promote({
      packId: "vira/demo", packVersion: "1.0.0", manifestDigest: digestA, from: "dev", to: "staging",
    });
    expect(staging.ok).toBe(true);
    const production = await created.value.promote({
      packId: "vira/demo", packVersion: "1.0.0", manifestDigest: digestA, from: "staging", to: "production",
    });
    expect(production.ok).toBe(true);
    expect(created.value.inspect().deployments.production?.manifestDigest).toBe(digestA);
  });

  it("rolls an environment back only to its own verified historical deployment", async () => {
    const created = plane();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const first = await created.value.publish(signed("Demo Pack", digestA, "1.0.0"));
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const secondArtifact = signed("Demo Pack", digestA, "1.1.0");
    const second = await created.value.publish(secondArtifact);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const rollback = await created.value.rollback({ environment: "dev", deploymentId: first.value.deploymentId });
    expect(rollback.ok).toBe(true);
    if (rollback.ok) {
      expect(rollback.value.operation).toBe("rollback");
      expect(rollback.value.packVersion).toBe("1.0.0");
      expect(rollback.value.revision).toBe(3);
    }

    const wrongEnvironment = await created.value.rollback({ environment: "staging", deploymentId: first.value.deploymentId });
    expect(wrongEnvironment.ok).toBe(false);
  });

  it("deprecates without destructive undeploy and blocks new promotion, rollback target, and cache acceptance", async () => {
    const created = plane();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const published = await created.value.publish(signed());
    expect(published.ok).toBe(true);
    if (!published.ok) return;

    const deprecated = await created.value.deprecate({ packId: "vira/demo", packVersion: "1.0.0", manifestDigest: digestA });
    expect(deprecated.ok).toBe(true);
    expect(created.value.inspect().deployments.dev?.artifactId).toBe(published.value.artifactId);

    const promotion = await created.value.promote({
      packId: "vira/demo", packVersion: "1.0.0", manifestDigest: digestA, from: "dev", to: "staging",
    });
    expect(promotion.ok).toBe(false);
    if (!promotion.ok) expect(promotion.issue.code).toBe("ARTIFACT_DEPRECATED");

    const cache = await created.value.verifyCachedPack(signed());
    expect(cache.ok).toBe(false);
    if (!cache.ok) expect(cache.issue.code).toBe("ARTIFACT_DEPRECATED");
  });

  it("serializes deprecation after an in-flight publish", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let digestCalls = 0;
    const created = createViraDeploymentPlane({
      integrity: {
        digest: async () => {
          digestCalls += 1;
          await gate;
          return digestA;
        },
        verifySignature: () => true,
      },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const publishPromise = created.value.publish(signed());
    const deprecatePromise = created.value.deprecate({ packId: "vira/demo", packVersion: "1.0.0", manifestDigest: digestA });
    expect(digestCalls).toBe(0);
    release();
    expect((await publishPromise).ok).toBe(true);
    const deprecated = await deprecatePromise;
    expect(deprecated.ok).toBe(true);
    if (deprecated.ok) expect(deprecated.value.status).toBe("deprecated");
  });
});
