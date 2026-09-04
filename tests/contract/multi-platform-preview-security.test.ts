import { test } from "vitest";
import assert from "node:assert/strict";
import { createViraMultiPlatformPreview, type ViraPreviewPackProvider } from "../../packages/genui/src/multi-platform-preview.js";
import type { StudioWorkbenchSession } from "../../packages/studio-workbench/src/index.js";

const workbench = {
  preview: () => ({ ok: false, issue: { code: "COMPILATION_FAILED", path: "$", message: "unused" } }),
  publish: () => ({ ok: true, value: {} }),
} as unknown as StudioWorkbenchSession;

const hostIOS = { version: "1", id: "preview.ios", platform: "ios", implementationIds: [], capabilities: [] } as never;
const hostAndroid = { version: "1", id: "preview.android", platform: "android", implementationIds: [], capabilities: [] } as never;
const brand = { version: "1", id: "preview.brand" } as never;

test("preview Pack handle rejects accessor properties without invoking getters", async () => {
  let reads = 0;
  const handle = Object.create(null);
  Object.defineProperty(handle, "version", { enumerable: true, value: "1" });
  Object.defineProperty(handle, "previewPackRef", { enumerable: true, get() { reads += 1; return "preview:pack:1"; } });
  let resolves = 0;
  const provider: ViraPreviewPackProvider = {
    version: "1",
    publish: () => handle,
    resolve: () => { resolves += 1; return {}; },
  };
  const created = createViraMultiPlatformPreview({
    workbench,
    instanceId: "preview-1",
    brand,
    iosHostManifest: hostIOS,
    androidHostManifest: hostAndroid,
    previewPackProvider: provider,
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const result = await created.value.real("iphone");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.code, "INVALID_PREVIEW_PACK");
  assert.equal(reads, 0);
  assert.equal(resolves, 0);
});

test("empty runtime instance identity is rejected at preview session creation", () => {
  const provider: ViraPreviewPackProvider = { version: "1", publish: () => ({}), resolve: () => ({}) };
  const created = createViraMultiPlatformPreview({
    workbench,
    instanceId: "",
    brand,
    iosHostManifest: hostIOS,
    androidHostManifest: hostAndroid,
    previewPackProvider: provider,
  });
  assert.equal(created.ok, false);
  if (!created.ok) assert.equal(created.issue.code, "INVALID_CONFIGURATION");
});
