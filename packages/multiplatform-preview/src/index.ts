import {
  type ViraDeploymentArtifactRecord,
  type ViraDeploymentPlane,
  type ViraSignedExperiencePack,
} from "@vira-enterprise-genui/deployment-plane";
import { parseExperiencePackManifest } from "@vira-enterprise-genui/experience-packs";
import {
  prepareStudioPreview,
  type StudioPreviewDescriptor,
} from "@vira-enterprise-genui/studio-publish";

export const VIRA_MULTIPLATFORM_PREVIEW_VERSION = "1" as const;
export const VIRA_FAST_PREVIEW_TARGETS = Object.freeze(["desktop", "mobile-web", "iphone", "android"] as const);
export const VIRA_REAL_PREVIEW_TARGETS = Object.freeze(["ios", "android"] as const);

export type ViraFastPreviewTarget = (typeof VIRA_FAST_PREVIEW_TARGETS)[number];
export type ViraRealPreviewTarget = (typeof VIRA_REAL_PREVIEW_TARGETS)[number];

export interface ViraFastPreviewViewport {
  readonly width: number;
  readonly height: number;
}
export interface ViraFastPreviewDescriptor {
  readonly version: typeof VIRA_MULTIPLATFORM_PREVIEW_VERSION;
  readonly mode: "fast";
  readonly target: ViraFastPreviewTarget;
  readonly semanticApproximation: boolean;
  readonly nativeRendererExecuted: false;
  readonly viewport: ViraFastPreviewViewport;
  readonly preview: StudioPreviewDescriptor;
}
export interface ViraNativePreviewAttestation {
  readonly version: typeof VIRA_MULTIPLATFORM_PREVIEW_VERSION;
  readonly target: ViraRealPreviewTarget;
  readonly renderer: "native";
  readonly status: "passed";
  readonly artifactId: string;
  readonly manifestDigest: string;
  readonly hostId: string;
}
export interface ViraNativePreviewRunner {
  readonly version: typeof VIRA_MULTIPLATFORM_PREVIEW_VERSION;
  readonly target: ViraRealPreviewTarget;
  readonly run: (input: {
    readonly artifact: ViraDeploymentArtifactRecord;
    readonly pack: ViraSignedExperiencePack;
  }) => Promise<unknown> | unknown;
}
export type ViraMultiplatformPreviewIssueCode =
  | "INVALID_FAST_PREVIEW"
  | "FAST_PREVIEW_FAILED"
  | "INVALID_REAL_PREVIEW"
  | "PACK_VERIFICATION_FAILED"
  | "PACK_NOT_REGISTERED"
  | "INVALID_RUNNER"
  | "RUNNER_FAILED"
  | "INVALID_ATTESTATION";
export interface ViraMultiplatformPreviewIssue {
  readonly code: ViraMultiplatformPreviewIssueCode;
  readonly path: string;
  readonly message: string;
}
export type ViraFastPreviewResult =
  | { readonly ok: true; readonly value: ViraFastPreviewDescriptor }
  | { readonly ok: false; readonly issue: ViraMultiplatformPreviewIssue };
export type ViraRealPreviewResult =
  | { readonly ok: true; readonly value: ViraNativePreviewAttestation }
  | { readonly ok: false; readonly issue: ViraMultiplatformPreviewIssue };

const FAST_VIEWPORTS: Readonly<Record<ViraFastPreviewTarget, ViraFastPreviewViewport>> = Object.freeze({
  desktop: Object.freeze({ width: 1440, height: 900 }),
  "mobile-web": Object.freeze({ width: 390, height: 844 }),
  iphone: Object.freeze({ width: 393, height: 852 }),
  android: Object.freeze({ width: 412, height: 915 }),
});

function issue(code: ViraMultiplatformPreviewIssueCode, path: string, message: string): ViraMultiplatformPreviewIssue {
  return Object.freeze({ code, path, message });
}
function isFastTarget(value: unknown): value is ViraFastPreviewTarget {
  return typeof value === "string" && VIRA_FAST_PREVIEW_TARGETS.includes(value as ViraFastPreviewTarget);
}
function isRealTarget(value: unknown): value is ViraRealPreviewTarget {
  return typeof value === "string" && VIRA_REAL_PREVIEW_TARGETS.includes(value as ViraRealPreviewTarget);
}
function validPlane(value: unknown): value is ViraDeploymentPlane {
  return value !== null && typeof value === "object"
    && (value as ViraDeploymentPlane).version === "1"
    && typeof (value as ViraDeploymentPlane).verifyCachedPack === "function"
    && typeof (value as ViraDeploymentPlane).inspect === "function";
}
function validRunner(value: unknown, target: ViraRealPreviewTarget): value is ViraNativePreviewRunner {
  return value !== null && typeof value === "object"
    && (value as ViraNativePreviewRunner).version === VIRA_MULTIPLATFORM_PREVIEW_VERSION
    && (value as ViraNativePreviewRunner).target === target
    && typeof (value as ViraNativePreviewRunner).run === "function";
}
function parseAttestation(input: unknown, target: ViraRealPreviewTarget, artifact: ViraDeploymentArtifactRecord): ViraNativePreviewAttestation | undefined {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return undefined;
  const value = input as Record<string, unknown>;
  const keys = Object.keys(value);
  if (keys.length !== 7 || !["version", "target", "renderer", "status", "artifactId", "manifestDigest", "hostId"].every((key) => Object.hasOwn(value, key))) return undefined;
  if (
    value.version !== VIRA_MULTIPLATFORM_PREVIEW_VERSION
    || value.target !== target
    || value.renderer !== "native"
    || value.status !== "passed"
    || value.artifactId !== artifact.artifactId
    || value.manifestDigest !== artifact.manifestDigest
    || typeof value.hostId !== "string"
    || value.hostId.length < 1
    || value.hostId.length > 256
  ) return undefined;
  return Object.freeze({
    version: VIRA_MULTIPLATFORM_PREVIEW_VERSION,
    target,
    renderer: "native",
    status: "passed",
    artifactId: artifact.artifactId,
    manifestDigest: artifact.manifestDigest,
    hostId: value.hostId,
  });
}

export function createViraFastStudioPreview(input: {
  readonly target: ViraFastPreviewTarget;
  readonly document: unknown;
  readonly componentCatalog: unknown;
  readonly bindingSourceCatalog: unknown;
  readonly actionAdapter: unknown;
  readonly viewId: string;
}): ViraFastPreviewResult {
  if (input === null || typeof input !== "object" || !isFastTarget(input.target) || typeof input.viewId !== "string") {
    return { ok: false, issue: issue("INVALID_FAST_PREVIEW", "$", "fast preview input or target is invalid") };
  }
  const preview = prepareStudioPreview(input);
  if (!preview.ok) return { ok: false, issue: issue("FAST_PREVIEW_FAILED", preview.issue.path, preview.issue.message) };
  return {
    ok: true,
    value: Object.freeze({
      version: VIRA_MULTIPLATFORM_PREVIEW_VERSION,
      mode: "fast",
      target: input.target,
      semanticApproximation: input.target === "iphone" || input.target === "android",
      nativeRendererExecuted: false,
      viewport: FAST_VIEWPORTS[input.target],
      preview: preview.value,
    }),
  };
}

export async function runViraRealNativePreview(input: {
  readonly target: ViraRealPreviewTarget;
  readonly pack: ViraSignedExperiencePack;
  readonly deploymentPlane: ViraDeploymentPlane;
  readonly runner: ViraNativePreviewRunner;
}): Promise<ViraRealPreviewResult> {
  if (input === null || typeof input !== "object" || !isRealTarget(input.target) || !validPlane(input.deploymentPlane)) {
    return { ok: false, issue: issue("INVALID_REAL_PREVIEW", "$", "real native preview input is invalid") };
  }
  if (!validRunner(input.runner, input.target)) {
    return { ok: false, issue: issue("INVALID_RUNNER", "$.runner", "native preview runner must exactly match the requested target") };
  }

  const verified = await input.deploymentPlane.verifyCachedPack(input.pack);
  if (!verified.ok) {
    return { ok: false, issue: issue("PACK_VERIFICATION_FAILED", "$.pack", verified.issue.message) };
  }
  const registered = input.deploymentPlane.inspect().artifacts.find((artifact) => artifact.artifactId === verified.value.artifactId);
  if (registered === undefined || registered.status !== "active") {
    return { ok: false, issue: issue("PACK_NOT_REGISTERED", "$.pack", "real native preview requires an active registered published Pack artifact") };
  }
  const manifest = parseExperiencePackManifest(input.pack.manifest);
  if (!manifest.ok) {
    return { ok: false, issue: issue("PACK_VERIFICATION_FAILED", "$.pack.manifest", "verified Pack could not be canonicalized for native preview") };
  }
  const canonicalPack: ViraSignedExperiencePack = Object.freeze({
    version: "1",
    manifest: manifest.value,
    manifestDigest: registered.manifestDigest,
    signature: registered.signature,
  });

  let raw: unknown;
  try {
    raw = await input.runner.run(Object.freeze({ artifact: registered, pack: canonicalPack }));
  } catch {
    return { ok: false, issue: issue("RUNNER_FAILED", "$.runner", "native preview runner failed closed") };
  }
  const attestation = parseAttestation(raw, input.target, registered);
  if (!attestation) {
    return { ok: false, issue: issue("INVALID_ATTESTATION", "$.runner", "native preview runner returned an invalid or mismatched attestation") };
  }
  return { ok: true, value: attestation };
}
