import type { ResolvedExperienceDescriptor } from "@vira-enterprise-genui/experience-resolver";
import { parseJsonValue, type JsonObject, type JsonValue } from "@vira-enterprise-genui/protocol";
import { isRuntimeSessionInstanceId } from "@vira-enterprise-genui/runtime-core";
import type { ViraBrandDefinition } from "@vira-enterprise-genui/studio-brand";
import type { StudioHostCapabilityManifest } from "@vira-enterprise-genui/studio-host";
import type { StudioPreviewDescriptor, StudioPreviewResult, StudioPublishResult } from "@vira-enterprise-genui/studio-publish";
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
export const VIRA_MULTI_PLATFORM_PREVIEW_TARGETS = Object.freeze(["desktop", "mobile-web", "iphone", "android"] as const);
export type ViraMultiPlatformPreviewTarget = (typeof VIRA_MULTI_PLATFORM_PREVIEW_TARGETS)[number];
export type ViraNativePreviewTarget = "iphone" | "android";
type StudioPublication = Extract<StudioPublishResult, { readonly ok: true }>["value"];

export interface ViraFastPreviewViewport { readonly width: number; readonly height: number; readonly deviceScaleFactor: number; }
export interface ViraFastPreviewArtifact {
  readonly version: typeof VIRA_MULTI_PLATFORM_PREVIEW_VERSION;
  readonly mode: "fast";
  readonly target: ViraMultiPlatformPreviewTarget;
  readonly semanticSurface: "web-approximation";
  readonly viewport: ViraFastPreviewViewport;
  readonly preview: StudioPreviewDescriptor;
  readonly nativeAccuracy: false;
}

export interface ViraPublishedPreviewPack {
  readonly version: typeof VIRA_MULTI_PLATFORM_PREVIEW_VERSION;
  readonly previewPackRef: string;
}
export interface ViraPreviewPackProvider {
  readonly version: typeof VIRA_MULTI_PLATFORM_PREVIEW_VERSION;
  readonly publish: (publication: StudioPublication) => Promise<unknown> | unknown;
  readonly resolve: (input: {
    readonly previewPackRef: string;
    readonly platform: "ios" | "android";
    readonly instanceId: string;
  }) => Promise<unknown> | unknown;
}

export interface ViraIOSRealPreviewArtifact {
  readonly version: typeof VIRA_MULTI_PLATFORM_PREVIEW_VERSION;
  readonly mode: "real";
  readonly target: "iphone";
  readonly nativeHost: "ios-simulator";
  readonly previewPack: ViraPublishedPreviewPack;
  readonly descriptor: ResolvedExperienceDescriptor;
  readonly envelope: ViraIOSMountEnvelope;
}
export interface ViraAndroidRealPreviewArtifact {
  readonly version: typeof VIRA_MULTI_PLATFORM_PREVIEW_VERSION;
  readonly mode: "real";
  readonly target: "android";
  readonly nativeHost: "android-emulator";
  readonly previewPack: ViraPublishedPreviewPack;
  readonly descriptor: ResolvedExperienceDescriptor;
  readonly envelope: ViraAndroidMountEnvelope;
}
export type ViraRealPreviewArtifact = ViraIOSRealPreviewArtifact | ViraAndroidRealPreviewArtifact;

export type ViraMultiPlatformPreviewIssueCode =
  | "INVALID_CONFIGURATION"
  | "WORKBENCH_SNAPSHOT_FAILED"
  | "FAST_PREVIEW_FAILED"
  | "PUBLICATION_FAILED"
  | "PREVIEW_PACK_PUBLISH_FAILED"
  | "INVALID_PREVIEW_PACK"
  | "PREVIEW_DESCRIPTOR_RESOLUTION_FAILED"
  | "INVALID_PREVIEW_DESCRIPTOR"
  | "NATIVE_PREVIEW_REJECTED"
  | "PREVIEW_PACK_DRIFT";
export interface ViraMultiPlatformPreviewIssue {
  readonly code: ViraMultiPlatformPreviewIssueCode;
  readonly path: string;
  readonly message: string;
  readonly nativeIssue?: ViraIOSMountEnvelopeIssue | ViraAndroidMountEnvelopeIssue;
}
export type ViraFastPreviewResult = { readonly ok: true; readonly value: ViraFastPreviewArtifact } | { readonly ok: false; readonly issue: ViraMultiPlatformPreviewIssue };
export type ViraRealPreviewResult = { readonly ok: true; readonly value: ViraRealPreviewArtifact } | { readonly ok: false; readonly issue: ViraMultiPlatformPreviewIssue };
export interface ViraMultiPlatformPreviewSession {
  readonly version: typeof VIRA_MULTI_PLATFORM_PREVIEW_VERSION;
  readonly fast: (target: ViraMultiPlatformPreviewTarget) => ViraFastPreviewResult;
  readonly real: (target: ViraNativePreviewTarget) => Promise<ViraRealPreviewResult>;
}
export type ViraMultiPlatformPreviewCreateResult = { readonly ok: true; readonly value: ViraMultiPlatformPreviewSession } | { readonly ok: false; readonly issue: ViraMultiPlatformPreviewIssue };

const VIEWPORTS: Readonly<Record<ViraMultiPlatformPreviewTarget, ViraFastPreviewViewport>> = Object.freeze({
  desktop: Object.freeze({ width: 1440, height: 900, deviceScaleFactor: 1 }),
  "mobile-web": Object.freeze({ width: 390, height: 844, deviceScaleFactor: 1 }),
  iphone: Object.freeze({ width: 393, height: 852, deviceScaleFactor: 3 }),
  android: Object.freeze({ width: 412, height: 915, deviceScaleFactor: 2.625 }),
});
const previewPackRefPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,511}$/;

function failure(code: ViraMultiPlatformPreviewIssueCode, path: string, message: string, nativeIssue?: ViraIOSMountEnvelopeIssue | ViraAndroidMountEnvelopeIssue): { readonly ok: false; readonly issue: ViraMultiPlatformPreviewIssue } {
  return { ok: false, issue: Object.freeze({ code, path, message, ...(nativeIssue === undefined ? {} : { nativeIssue }) }) };
}
function jsonObject(value: JsonValue | undefined): value is JsonObject { return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value); }
function validWorkbench(value: unknown): value is StudioWorkbenchSession {
  return value !== null && typeof value === "object" && typeof (value as StudioWorkbenchSession).preview === "function" && typeof (value as StudioWorkbenchSession).publish === "function";
}
function validProvider(value: unknown): value is ViraPreviewPackProvider {
  if (value === null || typeof value !== "object") return false;
  try {
    return (value as ViraPreviewPackProvider).version === VIRA_MULTI_PLATFORM_PREVIEW_VERSION
      && typeof (value as ViraPreviewPackProvider).publish === "function"
      && typeof (value as ViraPreviewPackProvider).resolve === "function";
  } catch { return false; }
}
function validTarget(value: unknown): value is ViraMultiPlatformPreviewTarget { return value === "desktop" || value === "mobile-web" || value === "iphone" || value === "android"; }
function parsePublishedPreviewPack(input: unknown): ViraPublishedPreviewPack | undefined {
  const parsed = parseJsonValue(input, "$.previewPack");
  if (!parsed.ok || !jsonObject(parsed.value)) return undefined;
  const value = parsed.value;
  const keys = Object.keys(value);
  if (keys.length !== 2 || !Object.hasOwn(value, "version") || !Object.hasOwn(value, "previewPackRef")) return undefined;
  if (value.version !== VIRA_MULTI_PLATFORM_PREVIEW_VERSION || typeof value.previewPackRef !== "string" || !previewPackRefPattern.test(value.previewPackRef)) return undefined;
  return Object.freeze({ version: VIRA_MULTI_PLATFORM_PREVIEW_VERSION, previewPackRef: value.previewPackRef });
}
interface NativeIdentity { readonly packId: string; readonly packVersion: string; readonly entrypoint: string; readonly artifactId: string; readonly artifactDigest: string; }
function identity(envelope: ViraIOSMountEnvelope | ViraAndroidMountEnvelope): NativeIdentity {
  return Object.freeze({ packId: envelope.pack.id, packVersion: envelope.pack.version, entrypoint: envelope.pack.entrypoint, artifactId: envelope.artifact.id, artifactDigest: envelope.artifact.digest });
}
function sameIdentity(left: NativeIdentity, right: NativeIdentity): boolean {
  return left.packId === right.packId && left.packVersion === right.packVersion && left.entrypoint === right.entrypoint && left.artifactId === right.artifactId && left.artifactDigest === right.artifactDigest;
}

export function createViraMultiPlatformPreview(input: {
  readonly workbench: StudioWorkbenchSession;
  readonly instanceId: string;
  readonly brand: ViraBrandDefinition;
  readonly iosHostManifest: StudioHostCapabilityManifest;
  readonly androidHostManifest: StudioHostCapabilityManifest;
  readonly previewPackProvider: ViraPreviewPackProvider;
}): ViraMultiPlatformPreviewCreateResult {
  if (input === null || typeof input !== "object" || !validWorkbench(input.workbench) || !isRuntimeSessionInstanceId(input.instanceId) || !validProvider(input.previewPackProvider)) {
    return failure("INVALID_CONFIGURATION", "$", "multi-platform preview configuration is invalid");
  }
  const { workbench, instanceId, brand, iosHostManifest, androidHostManifest } = input;
  const provider = input.previewPackProvider;
  let previewSnapshot: StudioPreviewResult;
  let publicationSnapshot: StudioPublishResult;
  try {
    previewSnapshot = workbench.preview();
    publicationSnapshot = workbench.publish();
  } catch {
    return failure("WORKBENCH_SNAPSHOT_FAILED", "$.workbench", "Workbench preview/publication snapshot failed closed");
  }

  let packPromise: Promise<ViraPublishedPreviewPack | { readonly issue: ViraMultiPlatformPreviewIssue }> | undefined;
  const descriptorPromises = new Map<"ios" | "android", Promise<ResolvedExperienceDescriptor | { readonly issue: ViraMultiPlatformPreviewIssue }>>();
  let acceptedIdentity: NativeIdentity | undefined;

  const publishPreviewPack = (): Promise<ViraPublishedPreviewPack | { readonly issue: ViraMultiPlatformPreviewIssue }> => {
    if (packPromise !== undefined) return packPromise;
    packPromise = (async () => {
      if (!publicationSnapshot.ok) return Object.freeze({ issue: failure("PUBLICATION_FAILED", publicationSnapshot.issue.path, publicationSnapshot.issue.message).issue });
      let raw: unknown;
      try { raw = await provider.publish(publicationSnapshot.value); }
      catch { return Object.freeze({ issue: failure("PREVIEW_PACK_PUBLISH_FAILED", "$.previewPackProvider.publish", "preview Pack publisher failed closed").issue }); }
      const pack = parsePublishedPreviewPack(raw);
      return pack ?? Object.freeze({ issue: failure("INVALID_PREVIEW_PACK", "$.previewPack", "preview Pack publisher returned an invalid Pack reference").issue });
    })();
    return packPromise;
  };

  const resolveDescriptor = (platform: "ios" | "android"): Promise<ResolvedExperienceDescriptor | { readonly issue: ViraMultiPlatformPreviewIssue }> => {
    const existing = descriptorPromises.get(platform);
    if (existing !== undefined) return existing;
    const pending = (async () => {
      const packOrIssue = await publishPreviewPack();
      if ("issue" in packOrIssue) return packOrIssue;
      let raw: unknown;
      try { raw = await provider.resolve({ previewPackRef: packOrIssue.previewPackRef, platform, instanceId }); }
      catch { return Object.freeze({ issue: failure("PREVIEW_DESCRIPTOR_RESOLUTION_FAILED", `$.${platform}`, "preview descriptor resolver failed closed").issue }); }
      if (raw === null || typeof raw !== "object") return Object.freeze({ issue: failure("INVALID_PREVIEW_DESCRIPTOR", `$.${platform}`, "preview descriptor resolver returned an invalid descriptor").issue });
      return raw as ResolvedExperienceDescriptor;
    })();
    descriptorPromises.set(platform, pending);
    return pending;
  };

  const session: ViraMultiPlatformPreviewSession = Object.freeze({
    version: VIRA_MULTI_PLATFORM_PREVIEW_VERSION,
    fast(target) {
      if (!validTarget(target)) return failure("INVALID_CONFIGURATION", "$.target", "preview target is invalid");
      if (!previewSnapshot.ok) return failure("FAST_PREVIEW_FAILED", previewSnapshot.issue.path, previewSnapshot.issue.message);
      return { ok: true, value: Object.freeze({ version: VIRA_MULTI_PLATFORM_PREVIEW_VERSION, mode: "fast", target, semanticSurface: "web-approximation", viewport: VIEWPORTS[target], preview: previewSnapshot.value, nativeAccuracy: false }) };
    },
    async real(target) {
      if (target !== "iphone" && target !== "android") return failure("INVALID_CONFIGURATION", "$.target", "real preview target must be iphone or android");
      const platform = target === "iphone" ? "ios" : "android";
      const packOrIssue = await publishPreviewPack();
      if ("issue" in packOrIssue) return { ok: false, issue: packOrIssue.issue };
      const descriptorOrIssue = await resolveDescriptor(platform);
      if ("issue" in descriptorOrIssue) return { ok: false, issue: descriptorOrIssue.issue };
      const descriptor = descriptorOrIssue;
      if (target === "iphone") {
        const envelope = createViraIOSMountEnvelope({ instanceId, descriptor, brand, hostManifest: iosHostManifest });
        if (!envelope.ok) return failure("NATIVE_PREVIEW_REJECTED", "$.iphone", "iOS preview mount envelope was rejected", envelope.issue);
        const currentIdentity = identity(envelope.value);
        if (acceptedIdentity !== undefined && !sameIdentity(acceptedIdentity, currentIdentity)) return failure("PREVIEW_PACK_DRIFT", "$.iphone", "native preview targets resolved different Pack/artifact identities");
        acceptedIdentity = currentIdentity;
        return { ok: true, value: Object.freeze({ version: VIRA_MULTI_PLATFORM_PREVIEW_VERSION, mode: "real", target, nativeHost: "ios-simulator", previewPack: packOrIssue, descriptor, envelope: envelope.value }) };
      }
      const envelope = createViraAndroidMountEnvelope({ instanceId, descriptor, brand, hostManifest: androidHostManifest });
      if (!envelope.ok) return failure("NATIVE_PREVIEW_REJECTED", "$.android", "Android preview mount envelope was rejected", envelope.issue);
      const currentIdentity = identity(envelope.value);
      if (acceptedIdentity !== undefined && !sameIdentity(acceptedIdentity, currentIdentity)) return failure("PREVIEW_PACK_DRIFT", "$.android", "native preview targets resolved different Pack/artifact identities");
      acceptedIdentity = currentIdentity;
      return { ok: true, value: Object.freeze({ version: VIRA_MULTI_PLATFORM_PREVIEW_VERSION, mode: "real", target, nativeHost: "android-emulator", previewPack: packOrIssue, descriptor, envelope: envelope.value }) };
    },
  });
  return { ok: true, value: session };
}
