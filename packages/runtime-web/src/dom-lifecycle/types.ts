import type { RenderCapabilityBinding, RenderModel } from "../renderer/index.js";

export interface RuntimeWebDomComponentHandle {
  dispose(): void;
}

export interface RuntimeWebDomRegion {
  mountComponent(binding: RenderCapabilityBinding): RuntimeWebDomComponentHandle;
}

export interface RuntimeWebDomRoot {
  createRegion(region: RenderModel["regions"][number]): RuntimeWebDomRegion;
  commit(): void;
  dispose(): void;
}

export interface RuntimeWebDomPort {
  begin(model: Readonly<Pick<RenderModel, "planId" | "mode" | "layout" | "disclosure">>): RuntimeWebDomRoot;
}

export interface MountedExperience {
  readonly planId: string;
  dispose(): void;
}

export type RuntimeWebMountValidationCode =
  | "INVALID_RENDER_INPUT"
  | "DOM_BEGIN_FAILED"
  | "DOM_MOUNT_FAILED";

export interface RuntimeWebMountValidationIssue {
  readonly code: RuntimeWebMountValidationCode;
  readonly path: string;
  readonly message: string;
}

export type RuntimeWebMountResult =
  | { readonly ok: true; readonly value: MountedExperience }
  | { readonly ok: false; readonly issue: RuntimeWebMountValidationIssue };
