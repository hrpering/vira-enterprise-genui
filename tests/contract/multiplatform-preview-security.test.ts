import test from "node:test";
import assert from "node:assert/strict";
import {
  runViraRealNativePreview,
  type ViraNativePreviewRunner,
} from "../../packages/multiplatform-preview/src/index.js";
import type {
  ViraDeploymentArtifactRecord,
  ViraDeploymentPlane,
  ViraSignedExperiencePack,
} from "../../packages/deployment-plane/src/index.js";

const digest = `sha256:${"a".repeat(64)}`;
const signature = Object.freeze({ algorithm: "ed25519" as const, keyId: "key:vira:preview-1", value: "abcdefghijklmnop" });
const pack: ViraSignedExperiencePack = Object.freeze({
  version: "1",
  manifest: Object.freeze({
    schemaVersion: "1",
    id: "vira/demo",
    version: "1.0.0",
    publisher: Object.freeze({ id: "vira", name: "Vira" }),
    metadata: Object.freeze({ name: "Preview Pack", tags: Object.freeze(["preview"]) }),
    compatibility: Object.freeze({ minViraVersion: "1.0.0" }),
    entrypoints: Object.freeze(["publication"]),
    artifacts: Object.freeze([{ id: "publication", role: "studio-publication" as const, mediaType: "application/json" as const, digest: `sha256:${"c".repeat(64)}`, size: 123 }]),
  }),
  manifestDigest: digest,
  signature,
});
const artifact: ViraDeploymentArtifactRecord = Object.freeze({
  artifactId: `artifact:vira/demo:1.0.0:${digest}`,
  packId: "vira/demo",
  packVersion: "1.0.0",
  manifestDigest: digest,
  signature,
  status: "active",
});
const plane = Object.freeze({
  version: "1",
  verifyCachedPack: async () => ({ ok: true, value: artifact }),
  inspect: () => Object.freeze({ artifacts: Object.freeze([artifact]), deployments: Object.freeze({ dev: null, staging: null, production: null }), history: Object.freeze([]) }),
}) as unknown as ViraDeploymentPlane;

test("native preview rejects accessor-backed attestation without invoking getter", async () => {
  let reads = 0;
  const runner: ViraNativePreviewRunner = Object.freeze({
    version: "1",
    target: "ios",
    run() {
      const attestation = Object.create(null);
      for (const [key, value] of Object.entries({
        target: "ios",
        renderer: "native",
        status: "passed",
        artifactId: artifact.artifactId,
        manifestDigest: artifact.manifestDigest,
        hostId: "ios.preview.host",
      })) Object.defineProperty(attestation, key, { enumerable: true, value });
      Object.defineProperty(attestation, "version", { enumerable: true, get() { reads += 1; return "1"; } });
      return attestation;
    },
  });
  const result = await runViraRealNativePreview({ target: "ios", pack, deploymentPlane: plane, runner });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.code, "INVALID_ATTESTATION");
  assert.equal(reads, 0);
});
