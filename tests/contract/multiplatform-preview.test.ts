import test from "node:test";
import assert from "node:assert/strict";
import {
  createViraFastStudioPreview,
  runViraRealNativePreview,
  type ViraNativePreviewRunner,
} from "../../packages/multiplatform-preview/src/index.js";
import type {
  ViraDeploymentArtifactRecord,
  ViraDeploymentPlane,
  ViraSignedExperiencePack,
} from "../../packages/deployment-plane/src/index.js";

const artifact: ViraDeploymentArtifactRecord = Object.freeze({
  artifactId: "artifact:acme/demo:1.0.0:sha256:" + "a".repeat(64),
  packId: "acme/demo",
  packVersion: "1.0.0",
  manifestDigest: "sha256:" + "a".repeat(64),
  signature: Object.freeze({ algorithm: "ed25519", keyId: "key-1", value: "abcdefghijklmnop" }),
  status: "active",
});

const pack = Object.freeze({
  version: "1",
  manifestDigest: artifact.manifestDigest,
  signature: artifact.signature,
  manifest: Object.freeze({}),
}) as unknown as ViraSignedExperiencePack;

function plane(registered = true): ViraDeploymentPlane {
  return Object.freeze({
    version: "1",
    publish: async () => ({ ok: false, issue: { code: "INVALID_PLANE", path: "$", message: "unused" } }),
    promote: async () => ({ ok: false, issue: { code: "INVALID_PLANE", path: "$", message: "unused" } }),
    rollback: async () => ({ ok: false, issue: { code: "INVALID_PLANE", path: "$", message: "unused" } }),
    deprecate: async () => ({ ok: false, issue: { code: "INVALID_PLANE", path: "$", message: "unused" } }),
    inspect: () => Object.freeze({
      artifacts: Object.freeze(registered ? [artifact] : []),
      deployments: Object.freeze({ dev: null, staging: null, production: null }),
      history: Object.freeze([]),
    }),
    verifyCachedPack: async () => ({ ok: true, value: artifact }),
  }) as unknown as ViraDeploymentPlane;
}

test("fast native-target previews are explicitly semantic approximations", () => {
  const result = createViraFastStudioPreview({
    target: "iphone",
    document: {},
    componentCatalog: {},
    bindingSourceCatalog: {},
    actionAdapter: {},
    viewId: "main",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.code, "FAST_PREVIEW_FAILED");
});

test("real native preview refuses a verified but unregistered Pack", async () => {
  let runs = 0;
  const runner: ViraNativePreviewRunner = Object.freeze({
    version: "1",
    target: "ios",
    run() { runs += 1; return {}; },
  });
  const result = await runViraRealNativePreview({ target: "ios", pack, deploymentPlane: plane(false), runner });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.code, "PACK_NOT_REGISTERED");
  assert.equal(runs, 0);
});

test("real native preview accepts only exact native attestation identity", async () => {
  const runner: ViraNativePreviewRunner = Object.freeze({
    version: "1",
    target: "ios",
    run() {
      return Object.freeze({
        version: "1",
        target: "ios",
        renderer: "native",
        status: "passed",
        artifactId: artifact.artifactId,
        manifestDigest: artifact.manifestDigest,
        hostId: "ios.preview.host",
      });
    },
  });
  const result = await runViraRealNativePreview({ target: "ios", pack, deploymentPlane: plane(true), runner });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.renderer, "native");
    assert.equal(result.value.target, "ios");
    assert.equal(result.value.artifactId, artifact.artifactId);
  }
});

test("native attestation cannot switch target or artifact identity", async () => {
  const runner: ViraNativePreviewRunner = Object.freeze({
    version: "1",
    target: "android",
    run() {
      return {
        version: "1",
        target: "ios",
        renderer: "native",
        status: "passed",
        artifactId: "forged",
        manifestDigest: artifact.manifestDigest,
        hostId: "android.preview.host",
      };
    },
  });
  const result = await runViraRealNativePreview({ target: "android", pack, deploymentPlane: plane(true), runner });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.code, "INVALID_ATTESTATION");
});
