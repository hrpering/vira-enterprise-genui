import test from "node:test";
import assert from "node:assert/strict";
import { createViraMultiPlatformPreview, type ViraPreviewPackProvider } from "../../packages/genui/src/multi-platform-preview.js";
import type { StudioWorkbenchSession } from "../../packages/studio-workbench/src/index.js";

test("one preview session snapshots Workbench preview and publication exactly once", async () => {
  let previewCalls = 0;
  let publicationCalls = 0;
  let publisherCalls = 0;
  const workbench = {
    preview: () => {
      previewCalls += 1;
      return { ok: true, value: { version: "1", experienceId: "snapshot.experience", viewId: "main", view: { id: "main", nodes: [] }, bindings: [], interactions: [], manifest: {} } };
    },
    publish: () => {
      publicationCalls += 1;
      return { ok: true, value: { version: "1", id: "snapshot.publication" } };
    },
  } as unknown as StudioWorkbenchSession;
  const provider: ViraPreviewPackProvider = {
    version: "1",
    publish: () => { publisherCalls += 1; return { version: "1", previewPackRef: "snapshot:pack:1" }; },
    resolve: ({ platform }) => ({ forged: platform }),
  };
  const created = createViraMultiPlatformPreview({
    workbench,
    instanceId: "snapshot-instance",
    brand: {} as never,
    iosHostManifest: {} as never,
    androidHostManifest: {} as never,
    previewPackProvider: provider,
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(previewCalls, 1);
  assert.equal(publicationCalls, 1);
  created.value.fast("desktop");
  created.value.fast("iphone");
  await created.value.real("iphone");
  await created.value.real("android");
  assert.equal(previewCalls, 1);
  assert.equal(publicationCalls, 1);
  assert.equal(publisherCalls, 1);
});
