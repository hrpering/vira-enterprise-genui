import type {
  ViraApplicationDistributionEnvelopeV2,
  ViraApplicationDistributionV2IntegrityVerifier,
} from "@vira-enterprise-genui/application-distribution";
import type { ViraApplicationReleaseReference } from "@vira-enterprise-genui/application-package";
import type {
  ViraEnterprisePrincipal,
  ViraEnterpriseScope,
  ViraSecretRef,
} from "@vira-enterprise-genui/enterprise-context";
import type {
  ViraArtifactSignature,
  ViraDeploymentEnvironment,
} from "./types.js";

export const VIRA_APPLICATION_DEPLOYMENT_VERSION = "2" as const;
export const VIRA_APPLICATION_DEPLOYMENT_ARTIFACT_KIND = "application-distribution" as const;
export const VIRA_APPLICATION_PUBLISHER_PROVENANCE_VERSION = "1" as const;
export const VIRA_APPLICATION_ENVIRONMENT_BINDING_VERSION = "1" as const;
export const VIRA_APPLICATION_TRUST_STATUSES = Object.freeze(["trusted", "untrusted"] as const);

export type ViraApplicationTrustStatus = (typeof VIRA_APPLICATION_TRUST_STATUSES)[number];
export type ViraApplicationDeploymentArtifactStatus = "active" | "deprecated";

export interface ViraAuthenticatedPublisherProvenance {
  readonly version: typeof VIRA_APPLICATION_PUBLISHER_PROVENANCE_VERSION;
  readonly publisherId: string;
  readonly principal: ViraEnterprisePrincipal;
  readonly authenticationRef: string;
}

export interface ViraApplicationEnvironmentBinding {
  readonly version: typeof VIRA_APPLICATION_ENVIRONMENT_BINDING_VERSION;
  readonly bindingRef: string;
  readonly scope: ViraEnterpriseScope;
  readonly providerIdentityRef: string;
  readonly location: string;
  readonly adapterRef: string;
  readonly secretRef: ViraSecretRef;
  readonly trustStatus: ViraApplicationTrustStatus;
  readonly trustEvidenceRef: string;
}

export interface ViraSignedApplicationDistribution {
  readonly version: typeof VIRA_APPLICATION_DEPLOYMENT_VERSION;
  readonly artifactKind: typeof VIRA_APPLICATION_DEPLOYMENT_ARTIFACT_KIND;
  readonly distribution: ViraApplicationDistributionEnvelopeV2;
  readonly provenance: ViraAuthenticatedPublisherProvenance;
  readonly signature: ViraArtifactSignature;
}

export interface ViraApplicationDeploymentTrustProvider {
  readonly verifyDistributionIntegrity: ViraApplicationDistributionV2IntegrityVerifier;
  readonly verifyPublisherProvenance: (input: {
    readonly applicationId: string;
    readonly applicationVersion: string;
    readonly publisherId: string;
    readonly principal: ViraEnterprisePrincipal;
    readonly authenticationRef: string;
  }) => Promise<boolean> | boolean;
  readonly verifySignature: (input: {
    readonly canonicalAttestation: string;
    readonly signature: ViraArtifactSignature;
  }) => Promise<boolean> | boolean;
}

export interface ViraApplicationDeploymentArtifactRecord {
  readonly artifactId: string;
  readonly artifactKind: typeof VIRA_APPLICATION_DEPLOYMENT_ARTIFACT_KIND;
  readonly release: ViraApplicationReleaseReference;
  readonly distributionDigest: string;
  readonly publisherId: string;
  readonly distribution: ViraApplicationDistributionEnvelopeV2;
  readonly provenance: ViraAuthenticatedPublisherProvenance;
  readonly signature: ViraArtifactSignature;
  readonly status: ViraApplicationDeploymentArtifactStatus;
}

export interface ViraApplicationDeploymentRecord {
  readonly deploymentId: string;
  readonly environment: ViraDeploymentEnvironment;
  readonly revision: number;
  readonly artifactId: string;
  readonly release: ViraApplicationReleaseReference;
  readonly distributionDigest: string;
  readonly binding: ViraApplicationEnvironmentBinding;
  readonly operation: "publish" | "promote" | "rollback";
  readonly previousDeploymentId?: string;
}

export interface ViraApplicationDeploymentCandidate {
  readonly artifact: ViraApplicationDeploymentArtifactRecord;
  readonly deployment: ViraApplicationDeploymentRecord;
}

export interface ViraApplicationDeploymentInspection {
  readonly artifacts: readonly ViraApplicationDeploymentArtifactRecord[];
  readonly deployments: Readonly<Record<ViraDeploymentEnvironment, ViraApplicationDeploymentRecord | null>>;
  readonly history: readonly ViraApplicationDeploymentRecord[];
}

export type ViraApplicationDeploymentIssueCode =
  | "INVALID_PLANE"
  | "INVALID_ARTIFACT"
  | "DISTRIBUTION_INVALID"
  | "DISTRIBUTION_INTEGRITY_FAILED"
  | "PUBLISHER_PROVENANCE_INVALID"
  | "PUBLISHER_AUTHENTICATION_FAILED"
  | "PUBLISHER_MISMATCH"
  | "SIGNATURE_INVALID"
  | "INVALID_BINDING"
  | "UNTRUSTED_BINDING"
  | "ARTIFACT_CONFLICT"
  | "ARTIFACT_DEPRECATED"
  | "ARTIFACT_NOT_FOUND"
  | "INVALID_PROMOTION"
  | "INVALID_ROLLBACK";

export interface ViraApplicationDeploymentIssue {
  readonly code: ViraApplicationDeploymentIssueCode;
  readonly path: string;
  readonly message: string;
}

export type ViraApplicationDeploymentResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issue: ViraApplicationDeploymentIssue };

export interface ViraApplicationDeploymentPlane {
  readonly version: typeof VIRA_APPLICATION_DEPLOYMENT_VERSION;
  readonly publish: (input: {
    readonly artifact: ViraSignedApplicationDistribution;
    readonly binding: ViraApplicationEnvironmentBinding;
  }) => Promise<ViraApplicationDeploymentResult<ViraApplicationDeploymentRecord>>;
  readonly promote: (input: {
    readonly release: ViraApplicationReleaseReference;
    readonly distributionDigest: string;
    readonly from: ViraDeploymentEnvironment;
    readonly to: ViraDeploymentEnvironment;
    readonly binding: ViraApplicationEnvironmentBinding;
  }) => Promise<ViraApplicationDeploymentResult<ViraApplicationDeploymentRecord>>;
  readonly rollback: (input: {
    readonly environment: ViraDeploymentEnvironment;
    readonly deploymentId: string;
  }) => Promise<ViraApplicationDeploymentResult<ViraApplicationDeploymentRecord>>;
  readonly deprecate: (input: {
    readonly release: ViraApplicationReleaseReference;
    readonly distributionDigest: string;
  }) => Promise<ViraApplicationDeploymentResult<ViraApplicationDeploymentArtifactRecord>>;
  readonly inspect: () => ViraApplicationDeploymentInspection;
  readonly verifyCachedApplication: (
    artifact: ViraSignedApplicationDistribution,
  ) => Promise<ViraApplicationDeploymentResult<ViraApplicationDeploymentArtifactRecord>>;
  readonly lookupActive: (input: {
    readonly release: ViraApplicationReleaseReference;
    readonly environment: ViraDeploymentEnvironment;
  }) => ViraApplicationDeploymentResult<ViraApplicationDeploymentCandidate | null>;
}

export type ViraApplicationDeploymentPlaneCreateResult =
  | { readonly ok: true; readonly value: ViraApplicationDeploymentPlane }
  | { readonly ok: false; readonly issue: ViraApplicationDeploymentIssue };
