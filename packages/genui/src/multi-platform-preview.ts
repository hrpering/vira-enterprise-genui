import type { ResolvedExperienceDescriptor } from "@vira-enterprise-genui/experience-resolver";
import type { ViraBrandDefinition } from "@vira-enterprise-genui/studio-brand";
import type { StudioHostCapabilityManifest } from "@vira-enterprise-genui/studio-host";
import type { StudioPublication } from "@vira-enterprise-genui/studio-compiler";
import type { StudioPreviewDescriptor } from "@vira-enterprise-genui/studio-publish";
import type { StudioWorkbenchSession } from "@vira-enterprise-genui/studio-workbench";
import {
  createViraIOSMountEnvelope,
  type ViraIOSMountEnvelope,
  type ViraIOSMountEnvelopeIssue,
} from "./ios-host-envelope.js";
import {
  createViraAndroidMountEnvelope,
  type ViraAndroidMountEnvelope,
  type ViraAndroidMountEnvelopeIssue,
} from "./android-host-envelope.js";

export const VIRA_MULTI_PLATFORM_PREVIEW_VERSION = "1" as const;
export const VIRA_MULTI_PLATFORM_PREVIEW_TARGETS = Object.freeze([
  "desktop",
  "mobile-web",
  "iphone",
  "android",
] as const);

export type ViraMultiPlatformPreviewTarget = (typeof VIRA_MULTI_PLATFORM_PREVIEW_TARGETS)[number];
export type ViraNativePreviewTarget = "iphone" | "android";

export interface ViraFastPreviewViewport {
  readonly width: number;
  readonly height: number;
  readonly deviceScaleFactor: number;
}

export interface ViraFastPreviewArtifact {
  readonly version: typeof VIRA_MULTI_PLATFORM_PREVIEW_VERSION;
  readonly mode: "fast";
  readonly target: ViraMultiPlatformPreviewTarget;
  readonly semanticSurface: "web-approximation";
  readonly viewport: ViraFastPreviewViewport;
  readonly preview: StudioPreviewDescriptor;
  readonly nativeAccuracy: false;
}

export interface ViraPreviewPackPublisher {
  readonly version: typeof VIRA_MULTI_PLATFORM_PREVIEW_VERSION;
  readonly publish: (publication: StudioPublication) => Promise<unknown> | unknown;
}

export interface ViraIOSRealPreviewArtifact {
  readonly version: typeof VIRA_MULTI_PLATFORM_PREVIEW_VERSION;
  readonly mode: "real";
  readonly target: "iphone";
  readonly nativeHost: "ios-simulator";
  readonly descriptor: ResolvedExperienceDescriptor;
  readonly envelope: ViraIOSMountEnvelope;
}

export interface ViraAndroidRealPreviewArtifact {
  readonly version: typeof VIRA_MULTI_PLATFORM_PREVIEW_VERSION;
  readonly mode: "real";
  readonly target: "android";
  readonly nativeHost: "android-emulator";
  readonly descriptor: ResolvedExperienceDescriptor;
  readonly envelope: ViraAndroidMountEnvelope;
}

export type ViraRealPreviewArtifact = ViraIOSRealPreviewArtifact | ViraAndroidRealPreviewArtifact;

export type ViraMultiPlatformPreviewIssueCode =
  | "INVALID_CONFIGURATION"
  | "FAST_PREVIEW_FAILED"
  | "PUBLICATION_FAILED"
  | "PREVIEW_PACK_PUBLISH_FAILED"
  | "INVALID_PREVIEW_DESCRIPTOR"
  | "NATIVE_PREVIEW_REJECTED";

export interface ViraMultiPlatformPreviewIssue {
  readonly code: ViraMultiPlatformPreviewIssueCode;
  readonly path: string;
  readonly message: string;
  readonly nativeIssue?: ViraIOSMountEnvelopeIssue | ViraAndroidMountEnvelopeIssue;
}

export type ViraFastPreviewResult =
  | { readonly ok: true; readonly value: ViraFastPreviewArtifact }
  | { readonly ok: false; readonly issue: ViraMultiPlatformPreviewIssue };
export type ViraRealPreviewResult =
  | { readonly ok: true; readonly value: ViraRealPreviewArtifact }
  | { readonly ok: false; readonly issue: ViraMultiPlatformPreviewIssue };

export interface ViraMultiPlatformPreviewSession {
  readonly version: typeof VIRA_MULTI_PLATFORM_PREVIEW_VERSION;
  readonly fast: (target: ViraMultiPlatformPreviewTarget) => ViraFastPreviewResult;
  readonly real: (target: ViraNativePreviewTarget) => Promise<ViraRealPreviewResult>;
}

export type ViraMultiPlatformPreviewCreateResult =
  | { readonly ok: true; readonly value: ViraMultiPlatformPreviewSession }
  | { readonly ok: false; readonly issue: ViraMultiPlatformPreviewIssue };

const VIEWPORTS: Readonly<Record<ViraMultiPlatformPreviewTarget, ViraFastPreviewViewport>> = Object.freeze({
  desktop: Object.freeze({ width: 1440, height: 900, deviceScaleFactor: 1 }),
  "mobile-web": Object.freeze({ width: 390, height: 844, deviceScaleFactor: 1 }),
  iphone: Object.freeze({ width: 393, height: 852, deviceScaleFactor: 3 }),
  android: Object.freeze({ width: 412, height: 915, deviceScaleFactor: 2.625 }),
});

function failure(
  code: ViraMultiPlatformPreviewIssueCode,
  path: string,
  message: string,
  nativeIssue?: ViraIOSMountEnvelopeIssue | ViraAndroidMountEnvelopeIssue,
): { readonly ok: false; readonly issue: ViraMultiPlatformPreviewIssue } {
  return {
    ok: false,
    issue: Object.freeze({ code, path, message, ...(nativeIssue === undefined ? {} : { nativeIssue }) }),
  };
}

function validWorkbench(value: unknown): value is StudioWorkbenchSession {
  return value !== null
    && typeof value === "object"
    && typeof (value as StudioWorkbenchSession).preview === "function"
    && typeof (value as StudioWorkbenchSession).publish === "function";
}

function validPublisher(value: unknown): value is ViraPreviewPackPublisher {
  return value !== null
    && typeof value === "object"
    && (value as ViraPreviewPackPublisher).version === VIRA_MULTI_PLATFORM_PREVIEW_VERSION
    && typeof (value as ViraPreviewPackPublisher).publish === "function";
}

function validTarget(value: unknown): value is ViraMultiPlatformPreviewTarget {
  return typeof value === "string" && (VIRA_MULTI_PLATFORM_PREVIEW_TARGETS as readonly string[]).includes(value);
}

export function createViraMultiPlatformPreview(input: {
  readonly workbench: StudioWorkbenchSession;
  readonly instanceId: string;
  readonly brand: ViraBrandDefinition;
  readonly iosHostManifest: StudioHostCapabilityManifest;
  readonly androidHostManifest: StudioHostCapabilityManifest;
  readonly previewPackPublisher: ViraPreviewPackPublisher;
}): ViraMultiPlatformPreviewCreateResult {
  if (
    input === null
    || typeof input !== "object"
    || !validWorkbench(input.workbench)
    || typeof input.instanceId !== "string"
    || input.instanceId.length < 1
    || input.instanceId.length > 256
    || !validPublisher(input.previewPackPublisher)
  ) {
    return failure("INVALID_CONFIGURATION", "$", "multi-platform preview configuration is invalid");
  }

  const workbench = input.workbench;
  const instanceId = input.instanceId;
  const brand = input.brand;
  const iosHostManifest = input.iosHostManifest;
  const androidHostManifest = input.androidHostManifest;
  const publisher = input.previewPackPublisher;
  let descriptorPromise: Promise<ResolvedExperienceDescriptor | { readonly issue: ViraMultiPlatformPreviewIssue }> | undefined;

  const publishPreviewDescriptor = (): Promise<ResolvedExperienceDescriptor | { readonly issue: ViraMultiPlatformPreviewIssue }> => {
    if (descriptorPromise !== undefined) return descriptorPromise;
    descriptorPromise = (async () => {
      const published = workbench.publish();
      if (!published.ok) {
        return Object.freeze({ issue: failure("PUBLICATION_FAILED", published.issue.path, published.issue.message).issue });
      }
      let descriptor: unknown;
      try {
        descriptor = await publisher.publish(published.value);
      } catch {
        return Object.freeze({ issue: failure("PREVIEW_PACK_PUBLISH_FAILED", "$.previewPackPublisher", "preview Pack publisher failed closed").issue });
      }
      if (descriptor === null || typeof descriptor !== "object") {
        return Object.freeze({ issue: failure("INVALID_PREVIEW_DESCRIPTOR", "$.descriptor", "preview Pack publisher returned an invalid descriptor").issue });
      }
      return descriptor as ResolvedExperienceDescriptor;
    })();
    return descriptorPromise;
  };

  const session: ViraMultiPlatformPreviewSession = Object.freeze({
    version: VIRA_MULTI_PLATFORM_PREVIEW_VERSION,
    fast(target) {
      if (!validTarget(target)) return failure("INVALID_CONFIGURATION", "$.target", "preview target is invalid");
      const preview = workbench.preview();
      if (!preview.ok) return failure("FAST_PREVIEW_FAILED", preview.issue.path, preview.issue.message);
      return {
        ok: true,
        value: Object.freeze({
          version: VIRA_MULTI_PLATFORM_PREVIEW_VERSION,
          mode: "fast" as const,
          target,
          semanticSurface: "web-approximation" as const,
          viewport: VIEWPORTS[target],
          preview: preview.value,
          nativeAccuracy: false as const,
        }),
      };
    },
    async real(target) {
      if (target !== "iphone" && target !== "android") return failure("INVALID_CONFIGURATION", "$.target", "real preview target must be iphone or android");
      const descriptorOrIssue = await publishPreviewDescriptor();
      if ("issue" in descriptorOrIssue) return { ok: false, issue: descriptorOrIssue.issue };
      const descriptor = descriptorOrIssue;
      if (target === "iphone") {
        const envelope = createViraIOSMountEnvelope({ instanceId, descriptor, brand, hostManifest: iosHostManifest });
        if (!envelope.ok) return failure("NATIVE_PREVIEW_REJECTED", "$.iphone", "iOS preview mount envelope was rejected", envelope.issue);
        return { ok: true, value: Object.freeze({ version: VIRA_MULTI_PLATFORM_PREVIEW_VERSION, mode: "real", target, nativeHost: "ios-simulator", descriptor, envelope: envelope.value }) };
      }
      const envelope = createViraAndroidMountEnvelope({ instanceId, descriptor, brand, hostManifest: androidHostManifest });
      if (!envelope.ok) return failure("NATIVE_PREVIEW_REJECTED", "$.android", "Android preview mount envelope was rejected", envelope.issue);
      return { ok: true, value: Object.freeze({ version: VIRA_MULTI_PLATFORM_PREVIEW_VERSION, mode: "real", target, nativeHost: "android-emulator", descriptor, envelope: envelope.value }) };
    },
  });
  return { ok: true, value: session };
}
