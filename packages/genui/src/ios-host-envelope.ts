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

export const VIRA_IOS_MOUNT_ENVELOPE_VERSION = VIRA_NATIVE_MOUNT_ENVELOPE_VERSION;
export const VIRA_IOS_PLATFORM = "ios" as const;

export type ViraIOSMountEnvelopeInput = ViraNativeMountEnvelopeInput;
export type ViraIOSMountEnvelopePackIdentity = ViraNativeMountEnvelopePackIdentity;
export type ViraIOSMountEnvelopeArtifactIdentity = ViraNativeMountEnvelopeArtifactIdentity;
export type ViraIOSMountEnvelopeCapability = ViraNativeMountEnvelopeCapability;
export type ViraIOSMountEnvelopeProp = ViraNativeMountEnvelopeProp;
export type ViraIOSMountEnvelopeEventPayloadField = ViraNativeMountEnvelopeEventPayloadField;
export type ViraIOSMountEnvelopeEvent = ViraNativeMountEnvelopeEvent;
export type ViraIOSMountEnvelopeComponent = ViraNativeMountEnvelopeComponent;
export type ViraIOSMountEnvelopeActionMapping = ViraNativeMountEnvelopeActionMapping;
export type ViraIOSMountEnvelopeBrand = ViraNativeMountEnvelopeBrand;
export type ViraIOSMountEnvelopeStage = ViraNativeMountEnvelopeStage;
export type ViraIOSMountEnvelope = ViraNativeMountEnvelope<typeof VIRA_IOS_PLATFORM>;

export interface ViraIOSMountEnvelopeCompatibility {
  readonly hostId: string;
  readonly platform: typeof VIRA_IOS_PLATFORM;
}

export interface ViraIOSMountEnvelopeHost {
  readonly version: "1";
  readonly id: string;
  readonly platform: typeof VIRA_IOS_PLATFORM;
  readonly implementationIds: readonly string[];
  readonly capabilities: readonly ViraIOSMountEnvelopeCapability[];
}

export type ViraIOSMountEnvelopeIssueCode =
  | "INVALID_INPUT"
  | "INVALID_INSTANCE_ID"
  | "INVALID_HOST_MANIFEST"
  | "NON_IOS_HOST"
  | "INVALID_DESCRIPTOR"
  | "INSTANCE_MISMATCH"
  | "HOST_MISMATCH"
  | "INVALID_BRAND"
  | "INVALID_IMPLEMENTATIONS"
  | "UNSUPPORTED_IMPLEMENTATION"
  | "INVALID_PUBLICATION"
  | "FORGED_PUBLICATION";

export interface ViraIOSMountEnvelopeIssue {
  readonly stage: ViraIOSMountEnvelopeStage;
  readonly code: ViraIOSMountEnvelopeIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraIOSMountEnvelopeResult =
  | { readonly ok: true; readonly value: ViraIOSMountEnvelope }
  | { readonly ok: false; readonly issue: ViraIOSMountEnvelopeIssue };

export function createViraIOSMountEnvelope(
  input: ViraIOSMountEnvelopeInput,
): ViraIOSMountEnvelopeResult {
  const result = createViraNativeMountEnvelope(input, VIRA_IOS_PLATFORM);
  if (result.ok) return result;
  if (result.issue.code === "NON_PLATFORM_HOST") {
    return {
      ok: false,
      issue: Object.freeze({ ...result.issue, code: "NON_IOS_HOST" as const }),
    };
  }
  return result as ViraIOSMountEnvelopeResult;
}
