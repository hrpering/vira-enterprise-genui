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

function components() {
  return {
    version: "1",
    id: "pegasus.studio.components",
    brandId: "pegasus",
    components: [
      { ref: "pegasus.component.button", label: "Button", category: "actions", kind: "action", props: [], slots: [], events: [{ name: "press", label: "Press" }] },
      { ref: "pegasus.component.flight-list", label: "Flight List", category: "flight", kind: "content", props: [{ key: "items", type: "string", required: true, bindable: true }], slots: [], events: [] },
    ],
  };
}
function sources() {
  return { version: "1", id: "pegasus.studio.data", sources: [{ kind: "domain", path: "travel.flight.results", label: "Flight results", valueType: "string" }] };
}
function actions() {
  return { version: "1", id: "pegasus.studio.actions", mappings: [{ event: "flight.search.submit", actionType: "travel.flight.search.submit" }] };
}
function document() {
  return {
    version: "1",
    id: "pegasus.flight-search",
    recipeId: "pegasus.flight-search",
    entryView: "search",
    views: [
      { id: "search", nodes: [{ id: "submit", component: "pegasus.component.button", order: 0, props: {} }] },
      { id: "results", nodes: [{ id: "flights", component: "pegasus.component.flight-list", order: 0, props: {} }] },
    ],
    bindings: [{ viewId: "results", nodeId: "flights", prop: "items", source: { kind: "domain", path: "travel.flight.results" } }],
    interactions: [{ viewId: "search", nodeId: "submit", event: "press", actionEvent: "flight.search.submit", routes: [{ outcome: "success", viewId: "results" }] }],
  };
}

const artifact: ViraDeploymentArtifactRecord = Object.freeze({
  artifactId: "artifact:acme/demo:1.0.0:sha256:" + "a".repeat(64),
  packId: "acme/demo",
  packVersion: "1.0.0",
  manifestDigest: "sha256:" + "a".repeat(64),
  signature: Object.freeze({ algorithm: "ed25519", keyId: "key-1", value: "abcdefghijklmnop" }),
  status: "active",
});
const pack = Object.freeze({ version: "1", manifestDigest: artifact.manifestDigest, signature: artifact.signature, manifest: Object.freeze({}) }) as unknown as ViraSignedExperiencePack;
function plane(registered = true): ViraDeploymentPlane {
  return Object.freeze({
    version: "1",
    publish: async () => ({ ok: false, issue: { code: "INVALID_PLANE", path: "$", message: "unused" } }),
    promote: async () => ({ ok: false, issue: { code: "INVALID_PLANE", path: "$", message: "unused" } }),
    rollback: async () => ({ ok: false, issue: { code: "INVALID_PLANE", path: "$", message: "unused" } }),
    deprecate: async () => ({ ok: false, issue: { code: "INVALID_PLANE", path: "$", message: "unused" } }),
    inspect: () => Object.freeze({ artifacts: Object.freeze(registered ? [artifact] : []), deployments: Object.freeze({ dev: null, staging: null, production: null }), history: Object.freeze([]) }),
    verifyCachedPack: async () => ({ ok: true, value: artifact }),
  }) as unknown as ViraDeploymentPlane;
}

test("fast desktop preview uses canonical Studio preview and is not native", () => {
  const result = createViraFastStudioPreview({ target: "desktop", document: document(), componentCatalog: components(), bindingSourceCatalog: sources(), actionAdapter: actions(), viewId: "results" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.semanticApproximation, false);
  assert.equal(result.value.nativeRendererExecuted, false);
  assert.deepEqual(result.value.viewport, { width: 1440, height: 900 });
  assert.equal(result.value.preview.experienceId, "pegasus.flight-search");
});

test("fast iPhone and Android previews are explicitly semantic approximations", () => {
  for (const target of ["iphone", "android"] as const) {
    const result = createViraFastStudioPreview({ target, document: document(), componentCatalog: components(), bindingSourceCatalog: sources(), actionAdapter: actions(), viewId: "results" });
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    assert.equal(result.value.semanticApproximation, true);
    assert.equal(result.value.nativeRendererExecuted, false);
  }
});

test("real native preview refuses a verified but unregistered Pack", async () => {
  let runs = 0;
  const runner: ViraNativePreviewRunner = Object.freeze({ version: "1", target: "ios", run() { runs += 1; return {}; } });
  const result = await runViraRealNativePreview({ target: "ios", pack, deploymentPlane: plane(false), runner });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.code, "PACK_NOT_REGISTERED");
  assert.equal(runs, 0);
});

test("real native preview accepts only exact native attestation identity", async () => {
  const runner: ViraNativePreviewRunner = Object.freeze({
    version: "1", target: "ios",
    run() { return Object.freeze({ version: "1", target: "ios", renderer: "native", status: "passed", artifactId: artifact.artifactId, manifestDigest: artifact.manifestDigest, hostId: "ios.preview.host" }); },
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
    version: "1", target: "android",
    run() { return { version: "1", target: "ios", renderer: "native", status: "passed", artifactId: "forged", manifestDigest: artifact.manifestDigest, hostId: "android.preview.host" }; },
  });
  const result = await runViraRealNativePreview({ target: "android", pack, deploymentPlane: plane(true), runner });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.code, "INVALID_ATTESTATION");
});
