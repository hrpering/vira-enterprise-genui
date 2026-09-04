import {
  createViraNativeMountEnvelope,
  VIRA_NATIVE_MOUNT_ENVELOPE_VERSION,
  type ViraNativeMountEnvelope,
  type ViraNativeMountEnvelopeActionMapping,
  type ViraNativeMountEnvelopeArtifactIdentity,
  type ViraNativeMountEnvelopeBrand,
  type ViraNativeMountEnvelopeCapability,
  type ViraNativeMountEnvelopeComponent,
  type ViraNativeMountEnvelopeEvent,
  type ViraNativeMountEnvelopeEventPayloadField,
  type ViraNativeMountEnvelopeInput,
  type ViraNativeMountEnvelopePackIdentity,
  type ViraNativeMountEnvelopeProp,
  type ViraNativeMountEnvelopeStage,
} from "./native-host-envelope.js";

export const VIRA_ANDROID_MOUNT_ENVELOPE_VERSION = VIRA_NATIVE_MOUNT_ENVELOPE_VERSION;
export const VIRA_ANDROID_PLATFORM = "android" as const;

export type ViraAndroidMountEnvelopeInput = ViraNativeMountEnvelopeInput;
export type ViraAndroidMountEnvelopePackIdentity = ViraNativeMountEnvelopePackIdentity;
export type ViraAndroidMountEnvelopeArtifactIdentity = ViraNativeMountEnvelopeArtifactIdentity;
export type ViraAndroidMountEnvelopeCapability = ViraNativeMountEnvelopeCapability;
export type ViraAndroidMountEnvelopeProp = ViraNativeMountEnvelopeProp;
export type ViraAndroidMountEnvelopeEventPayloadField = ViraNativeMountEnvelopeEventPayloadField;
export type ViraAndroidMountEnvelopeEvent = ViraNativeMountEnvelopeEvent;
export type ViraAndroidMountEnvelopeComponent = ViraNativeMountEnvelopeComponent;
export type ViraAndroidMountEnvelopeActionMapping = ViraNativeMountEnvelopeActionMapping;
export type ViraAndroidMountEnvelopeBrand = ViraNativeMountEnvelopeBrand;
export type ViraAndroidMountEnvelopeStage = ViraNativeMountEnvelopeStage;
export type ViraAndroidMountEnvelope = ViraNativeMountEnvelope<typeof VIRA_ANDROID_PLATFORM>;

export interface ViraAndroidMountEnvelopeCompatibility {
  readonly hostId: string;
  readonly platform: typeof VIRA_ANDROID_PLATFORM;
}

export interface ViraAndroidMountEnvelopeHost {
  readonly version: "1";
  readonly id: string;
  readonly platform: typeof VIRA_ANDROID_PLATFORM;
  readonly implementationIds: readonly string[];
  readonly capabilities: readonly ViraAndroidMountEnvelopeCapability[];
}

export type ViraAndroidMountEnvelopeIssueCode =
  | "INVALID_INPUT"
  | "INVALID_INSTANCE_ID"
  | "INVALID_HOST_MANIFEST"
  | "NON_ANDROID_HOST"
  | "INVALID_DESCRIPTOR"
  | "INSTANCE_MISMATCH"
  | "HOST_MISMATCH"
  | "INVALID_BRAND"
  | "INVALID_IMPLEMENTATIONS"
  | "UNSUPPORTED_IMPLEMENTATION"
  | "INVALID_PUBLICATION"
  | "FORGED_PUBLICATION";

export interface ViraAndroidMountEnvelopeIssue {
  readonly stage: ViraAndroidMountEnvelopeStage;
  readonly code: ViraAndroidMountEnvelopeIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraAndroidMountEnvelopeResult =
  | { readonly ok: true; readonly value: ViraAndroidMountEnvelope }
  | { readonly ok: false; readonly issue: ViraAndroidMountEnvelopeIssue };

export function createViraAndroidMountEnvelope(
  input: ViraAndroidMountEnvelopeInput,
): ViraAndroidMountEnvelopeResult {
  const result = createViraNativeMountEnvelope(input, VIRA_ANDROID_PLATFORM);
  if (result.ok) return result;
  if (result.issue.code === "NON_PLATFORM_HOST") {
    return {
      ok: false,
      issue: Object.freeze({ ...result.issue, code: "NON_ANDROID_HOST" as const }),
    };
  }
  return result as ViraAndroidMountEnvelopeResult;
}
