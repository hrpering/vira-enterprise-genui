import type { CapabilityAllowlistPolicy } from "@vira-enterprise-genui/security";
import type { AccessibilityPolicy } from "../accessibility/index.js";
import type { RenderCapabilityBinding, RenderModel } from "../renderer/index.js";
import type { ResponsiveBand } from "../responsive/index.js";

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

export interface RuntimeWebDomBeginContext {
  readonly planId: RenderModel["planId"];
  readonly mode: RenderModel["mode"];
  readonly layout: RenderModel["layout"];
  readonly disclosure: RenderModel["disclosure"];
  readonly accessibility: AccessibilityPolicy;
  readonly responsiveBand: ResponsiveBand;
}

export interface RuntimeWebDomPort {
  measureContainerInlineSizePx(): number;
  begin(context: RuntimeWebDomBeginContext): RuntimeWebDomRoot;
}

export interface RuntimeWebMountInput {
  readonly composition: unknown;
  readonly plan: unknown;
  readonly componentAdapter: unknown;
  readonly capabilityAllowlist: CapabilityAllowlistPolicy | unknown;
  readonly accessibility: unknown;
  readonly responsive: unknown;
}

export interface MountedExperience {
  readonly planId: string;
  dispose(): void;
}

export type RuntimeWebMountValidationCode =
  | "INVALID_MOUNT_INPUT"
  | "INVALID_RENDER_INPUT"
  | "INVALID_CAPABILITY_ALLOWLIST"
  | "CAPABILITY_DENIED"
  | "INVALID_RESPONSIVE_POLICY"
  | "CONTAINER_MEASURE_FAILED"
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
