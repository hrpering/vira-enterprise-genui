import type { ExperiencePackManifest } from "@vira-enterprise-genui/experience-packs";

export const VIRA_DEPLOYMENT_PLANE_VERSION = "1" as const;
export const VIRA_DEPLOYMENT_ENVIRONMENTS = Object.freeze(["dev", "staging", "production"] as const);
export const VIRA_DEPLOYMENT_SIGNATURE_ALGORITHMS = Object.freeze(["ed25519", "ecdsa-p256-sha256"] as const);

export type ViraDeploymentEnvironment = (typeof VIRA_DEPLOYMENT_ENVIRONMENTS)[number];
export type ViraDeploymentSignatureAlgorithm = (typeof VIRA_DEPLOYMENT_SIGNATURE_ALGORITHMS)[number];
export type ViraDeploymentArtifactStatus = "active" | "deprecated";

export interface ViraArtifactSignature {
  readonly algorithm: ViraDeploymentSignatureAlgorithm;
  readonly keyId: string;
  readonly value: string;
}

export interface ViraSignedExperiencePack {
  readonly version: typeof VIRA_DEPLOYMENT_PLANE_VERSION;
  readonly manifest: ExperiencePackManifest;
  readonly manifestDigest: string;
  readonly signature: ViraArtifactSignature;
}

export interface ViraDeploymentIntegrityProvider {
  readonly digest: (canonicalManifest: string) => Promise<string> | string;
  readonly verifySignature: (input: {
    readonly manifestDigest: string;
    readonly signature: ViraArtifactSignature;
  }) => Promise<boolean> | boolean;
}

export interface ViraDeploymentArtifactRecord {
  readonly artifactId: string;
  readonly packId: string;
  readonly packVersion: string;
  readonly manifestDigest: string;
  readonly signature: ViraArtifactSignature;
  readonly status: ViraDeploymentArtifactStatus;
}

export interface ViraDeploymentRecord {
  readonly deploymentId: string;
  readonly environment: ViraDeploymentEnvironment;
  readonly revision: number;
  readonly artifactId: string;
  readonly packId: string;
  readonly packVersion: string;
  readonly manifestDigest: string;
  readonly operation: "publish" | "promote" | "rollback";
  readonly previousDeploymentId?: string;
}

export interface ViraDeploymentInspection {
  readonly artifacts: readonly ViraDeploymentArtifactRecord[];
  readonly deployments: Readonly<Record<ViraDeploymentEnvironment, ViraDeploymentRecord | null>>;
  readonly history: readonly ViraDeploymentRecord[];
}

export type ViraDeploymentIssueCode =
  | "INVALID_PLANE"
  | "INVALID_ARTIFACT"
  | "DIGEST_MISMATCH"
  | "SIGNATURE_INVALID"
  | "ARTIFACT_CONFLICT"
  | "ARTIFACT_DEPRECATED"
  | "ARTIFACT_NOT_FOUND"
  | "INVALID_PROMOTION"
  | "INVALID_ROLLBACK";

export interface ViraDeploymentIssue {
  readonly code: ViraDeploymentIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraDeploymentResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: ViraDeploymentIssue };

export interface ViraDeploymentPlane {
  readonly version: typeof VIRA_DEPLOYMENT_PLANE_VERSION;
  readonly publish: (artifact: ViraSignedExperiencePack) => Promise<ViraDeploymentResult<ViraDeploymentRecord>>;
  readonly promote: (input: {
    readonly packId: string;
    readonly packVersion: string;
    readonly manifestDigest: string;
    readonly from: ViraDeploymentEnvironment;
    readonly to: ViraDeploymentEnvironment;
  }) => Promise<ViraDeploymentResult<ViraDeploymentRecord>>;
  readonly rollback: (input: {
    readonly environment: ViraDeploymentEnvironment;
    readonly deploymentId: string;
  }) => ViraDeploymentResult<ViraDeploymentRecord>;
  readonly deprecate: (input: {
    readonly packId: string;
    readonly packVersion: string;
    readonly manifestDigest: string;
  }) => ViraDeploymentResult<ViraDeploymentArtifactRecord>;
  readonly inspect: () => ViraDeploymentInspection;
  readonly verifyCachedPack: (artifact: ViraSignedExperiencePack) => Promise<ViraDeploymentResult<ViraDeploymentArtifactRecord>>;
}

export type ViraDeploymentPlaneCreateResult =
  | { readonly ok: true; readonly value: ViraDeploymentPlane }
  | { readonly ok: false; readonly issue: ViraDeploymentIssue };
