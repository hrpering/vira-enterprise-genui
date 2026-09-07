import type {
  ViraApplicationDeploymentArtifactRecord,
  ViraApplicationDeploymentCandidate,
  ViraApplicationDeploymentIssue,
  ViraApplicationDeploymentResult,
  ViraApplicationEnvironmentBinding,
  ViraAuthenticatedPublisherProvenance,
  ViraSignedApplicationDistribution,
} from "@vira-enterprise-genui/deployment-plane";
import type { ViraApplicationDistributionEnvelopeV2 } from "@vira-enterprise-genui/application-distribution";
import type { ViraApplicationReleaseReference } from "@vira-enterprise-genui/application-package";
import type { ViraEnterpriseScope } from "@vira-enterprise-genui/enterprise-context";

export const VIRA_APPLICATION_RESOLUTION_SCHEMA_VERSION = "1" as const;

export interface ViraApplicationResolutionArtifact {
  readonly schemaVersion: typeof VIRA_APPLICATION_RESOLUTION_SCHEMA_VERSION;
  readonly release: ViraApplicationReleaseReference;
  readonly environment: ViraEnterpriseScope["environment"];
  readonly deploymentId: string;
  readonly deploymentRevision: number;
  readonly artifactId: string;
  readonly distributionDigest: string;
  readonly publisherId: string;
  readonly distribution: ViraApplicationDistributionEnvelopeV2;
  readonly provenance: ViraAuthenticatedPublisherProvenance;
  readonly binding: ViraApplicationEnvironmentBinding;
}

export interface ViraApplicationResolution {
  readonly artifact: ViraApplicationResolutionArtifact;
  readonly canonicalArtifact: string;
  readonly resolutionDigest: string;
}

export interface ViraApplicationResolutionRequest {
  readonly release: ViraApplicationReleaseReference;
  readonly scope: ViraEnterpriseScope;
}

export interface ViraApplicationResolutionSource {
  readonly lookupActive: (input: {
    readonly release: ViraApplicationReleaseReference;
    readonly scope: ViraEnterpriseScope;
  }) => ViraApplicationDeploymentResult<ViraApplicationDeploymentCandidate | null>
    | Promise<ViraApplicationDeploymentResult<ViraApplicationDeploymentCandidate | null>>;
  readonly verifyCachedApplication: (input: {
    readonly scope: ViraEnterpriseScope;
    readonly artifact: ViraSignedApplicationDistribution;
  }) => ViraApplicationDeploymentResult<ViraApplicationDeploymentArtifactRecord>
    | Promise<ViraApplicationDeploymentResult<ViraApplicationDeploymentArtifactRecord>>;
}

export type ViraApplicationResolutionDigestProvider = (
  canonicalArtifact: string,
) => string | Promise<string>;

export type ViraApplicationResolutionIssueCode =
  | "INVALID_RESOLVER"
  | "INVALID_REQUEST"
  | "INVALID_RELEASE"
  | "INVALID_SCOPE"
  | "SOURCE_FAILED"
  | "APPLICATION_NOT_FOUND"
  | "APPLICATION_DEPRECATED"
  | "SOURCE_CONFLICT"
  | "UNTRUSTED_BINDING"
  | "DIGEST_PROVIDER_FAILED"
  | "INVALID_RESOLUTION_DIGEST";

export interface ViraApplicationResolutionIssue {
  readonly code: ViraApplicationResolutionIssueCode;
  readonly path: string;
  readonly message: string;
  readonly deploymentIssue?: ViraApplicationDeploymentIssue;
}

export type ViraApplicationResolutionResult =
  | { readonly ok: true; readonly value: ViraApplicationResolution }
  | { readonly ok: false; readonly issue: ViraApplicationResolutionIssue };

export interface ViraApplicationResolver {
  readonly version: typeof VIRA_APPLICATION_RESOLUTION_SCHEMA_VERSION;
  readonly resolve: (request: ViraApplicationResolutionRequest) => Promise<ViraApplicationResolutionResult>;
}

export type ViraApplicationResolverCreateResult =
  | { readonly ok: true; readonly value: ViraApplicationResolver }
  | { readonly ok: false; readonly issue: ViraApplicationResolutionIssue };
