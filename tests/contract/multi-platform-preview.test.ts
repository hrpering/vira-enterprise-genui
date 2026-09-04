import { test } from "vitest";
import assert from "node:assert/strict";
import {
  createViraMultiPlatformPreview,
  type ViraPreviewPackProvider,
} from "../../packages/genui/src/multi-platform-preview.js";
import type { StudioWorkbenchSession } from "../../packages/studio-workbench/src/index.js";

function fakeWorkbench(): StudioWorkbenchSession {
  return {
    preview: () => ({
      ok: true,
      value: {
        version: "1",
        experienceId: "acme.preview",
        viewId: "main",
        view: { id: "main", nodes: [] },
        bindings: [],
        interactions: [],
        manifest: { components: [], actions: [], dataSources: [] },
      },
    }),
    publish: () => ({ ok: false, issue: { code: "COMPILATION_FAILED", path: "$", message: "publish failed" } }),
  } as unknown as StudioWorkbenchSession;
}

const emptyHost = { version: "1", id: "preview.host", platform: "ios", implementations: [], capabilities: [] } as const;
const emptyAndroidHost = { ...emptyHost, id: "preview.android", platform: "android" } as const;
const brand = { version: "1", id: "acme", package: {}, design: {}, policies: {}, implementations: [] } as const;
const inertProvider: ViraPreviewPackProvider = { version: "1", publish: () => ({ version: "1", previewPackRef: "preview:pack:1" }), resolve: () => ({}) };

test("fast preview exposes semantic approximation and never claims native accuracy", () => {
  const created = createViraMultiPlatformPreview({
    workbench: fakeWorkbench(), instanceId: "preview-1", brand: brand as never,
    iosHostManifest: emptyHost as never, androidHostManifest: emptyAndroidHost as never,
    previewPackProvider: inertProvider,
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  for (const target of ["desktop", "mobile-web", "iphone", "android"] as const) {
    const preview = created.value.fast(target);
    assert.equal(preview.ok, true);
    if (!preview.ok) continue;
    assert.equal(preview.value.semanticSurface, "web-approximation");
    assert.equal(preview.value.nativeAccuracy, false);
    assert.equal(preview.value.target, target);
    assert.equal(Object.isFrozen(preview.value.viewport), true);
  }
});

test("real native preview requires canonical Workbench publication before preview Pack publication", async () => {
  let publishes = 0;
  const provider: ViraPreviewPackProvider = {
    version: "1",
    publish: () => { publishes += 1; return { version: "1", previewPackRef: "preview:pack:1" }; },
    resolve: () => ({}),
  };
  const created = createViraMultiPlatformPreview({
    workbench: fakeWorkbench(), instanceId: "preview-1", brand: brand as never,
    iosHostManifest: emptyHost as never, androidHostManifest: emptyAndroidHost as never,
    previewPackProvider: provider,
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const result = await created.value.real("iphone");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.code, "PUBLICATION_FAILED");
  assert.equal(publishes, 0);
});

test("native targets publish one Pack but resolve independent platform descriptors", async () => {
  let publishes = 0;
  const platforms: string[] = [];
  const provider: ViraPreviewPackProvider = {
    version: "1",
    publish: () => { publishes += 1; return { version: "1", previewPackRef: "preview:pack:1" }; },
    resolve: ({ platform }) => { platforms.push(platform); return { forged: platform }; },
  };
  const workbench = {
    preview: fakeWorkbench().preview,
    publish: () => ({ ok: true, value: { version: "1", id: "acme.preview", document: {} } }),
  } as unknown as StudioWorkbenchSession;
  const created = createViraMultiPlatformPreview({
    workbench, instanceId: "preview-1", brand: brand as never,
    iosHostManifest: emptyHost as never, androidHostManifest: emptyAndroidHost as never,
    previewPackProvider: provider,
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const ios = await created.value.real("iphone");
  const android = await created.value.real("android");
  assert.equal(ios.ok, false);
  assert.equal(android.ok, false);
  if (!ios.ok) assert.equal(ios.issue.code, "NATIVE_PREVIEW_REJECTED");
  if (!android.ok) assert.equal(android.issue.code, "NATIVE_PREVIEW_REJECTED");
  assert.equal(publishes, 1);
  assert.deepEqual(platforms, ["ios", "android"]);
});

test("invalid preview Pack reference fails before platform descriptor resolution", async () => {
  let resolves = 0;
  const provider: ViraPreviewPackProvider = {
    version: "1",
    publish: () => ({ version: "1", previewPackRef: "../unsafe" }),
    resolve: () => { resolves += 1; return {}; },
  };
  const workbench = { preview: fakeWorkbench().preview, publish: () => ({ ok: true, value: {} }) } as unknown as StudioWorkbenchSession;
  const created = createViraMultiPlatformPreview({
    workbench, instanceId: "preview-1", brand: brand as never,
    iosHostManifest: emptyHost as never, androidHostManifest: emptyAndroidHost as never,
    previewPackProvider: provider,
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const result = await created.value.real("iphone");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.code, "INVALID_PREVIEW_PACK");
  assert.equal(resolves, 0);
});
