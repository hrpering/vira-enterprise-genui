import { prepareRenderModel } from "../renderer/index.js";
import type { RuntimeWebDomComponentHandle, RuntimeWebDomPort, RuntimeWebDomRoot, RuntimeWebMountResult } from "./types.js";

function failure(code: "INVALID_RENDER_INPUT" | "DOM_BEGIN_FAILED" | "DOM_MOUNT_FAILED", path: string, message: string): RuntimeWebMountResult {
  return { ok: false, issue: { code, path, message } };
}

function safeDispose(handle: { dispose(): void }): void {
  try {
    handle.dispose();
  } catch {
    // Cleanup is best effort; later handles/root must still be attempted.
  }
}

function rollback(root: RuntimeWebDomRoot | undefined, components: readonly RuntimeWebDomComponentHandle[]): void {
  for (let index = components.length - 1; index >= 0; index -= 1) {
    const handle = components[index];
    if (handle) safeDispose(handle);
  }
  if (root) safeDispose(root);
}

export function mountExperience(input: unknown, domPort: RuntimeWebDomPort): RuntimeWebMountResult {
  const prepared = prepareRenderModel(input);
  if (!prepared.ok) return failure("INVALID_RENDER_INPUT", prepared.issue.path, prepared.issue.message);

  const components: RuntimeWebDomComponentHandle[] = [];
  let root: RuntimeWebDomRoot | undefined;

  try {
    root = domPort.begin({
      planId: prepared.value.planId,
      mode: prepared.value.mode,
      layout: prepared.value.layout,
      disclosure: prepared.value.disclosure,
    });
  } catch {
    return failure("DOM_BEGIN_FAILED", "$", "DOM host failed to begin experience mount");
  }

  try {
    for (const region of prepared.value.regions) {
      const domRegion = root.createRegion(region);
      for (const binding of region.bindings) components.push(domRegion.mountComponent(binding));
    }
    root.commit();
  } catch {
    rollback(root, components);
    return failure("DOM_MOUNT_FAILED", "$", "DOM host failed while mounting experience");
  }

  let disposed = false;
  return {
    ok: true,
    value: Object.freeze({
      planId: prepared.value.planId,
      dispose(): void {
        if (disposed) return;
        disposed = true;
        rollback(root, components);
      },
    }),
  };
}
