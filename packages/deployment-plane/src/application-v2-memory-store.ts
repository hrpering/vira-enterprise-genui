import type { ViraEnterpriseScope } from "@vira-enterprise-genui/enterprise-context";
import {
  type ViraApplicationDeploymentArtifactRecord,
  type ViraApplicationDeploymentCommitInput,
  type ViraApplicationDeploymentInspection,
  type ViraApplicationDeploymentResult,
  type ViraApplicationDeploymentStateStore,
  type ViraApplicationDeploymentStoreArtifact,
  type ViraApplicationDeploymentRecord,
  type ViraSignedApplicationDistribution,
} from "./application-v2-types.js";

function issue(code: "ARTIFACT_CONFLICT" | "ARTIFACT_DEPRECATED" | "ARTIFACT_NOT_FOUND" | "DEPLOYMENT_CONFLICT", path: string, message: string) {
  return Object.freeze({ code, path, message });
}

function exactScope(left: ViraEnterpriseScope, right: ViraEnterpriseScope): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function releaseKey(id: string, version: string): string {
  return `${id}\u0000${version}`;
}

function activationKey(scope: ViraEnterpriseScope, applicationId: string): string {
  return `${scope.organizationId}\u0000${scope.projectId}\u0000${scope.environment}\u0000${applicationId}`;
}

interface OwnedArtifact {
  readonly artifact: ViraApplicationDeploymentArtifactRecord;
  readonly signed: ViraSignedApplicationDistribution;
  readonly publisherOrganizationId: string;
  readonly publisherProjectId: string;
}

export function createInMemoryApplicationDeploymentStateStore(): ViraApplicationDeploymentStateStore {
  const releases = new Map<string, OwnedArtifact>();
  const active = new Map<string, ViraApplicationDeploymentRecord>();
  const history: ViraApplicationDeploymentRecord[] = [];

  return Object.freeze<ViraApplicationDeploymentStateStore>({
    async registerArtifact(input): Promise<ViraApplicationDeploymentResult<ViraApplicationDeploymentArtifactRecord>> {
      if (input.artifact.provenance.principal.organizationId !== input.scope.organizationId) {
        return { ok: false, issue: issue("ARTIFACT_CONFLICT", "$.scope.organizationId", "authenticated publisher organization does not own the release scope") };
      }
      const key = releaseKey(input.artifact.release.id, input.artifact.release.version);
      const existing = releases.get(key);
      if (existing !== undefined) {
        if (existing.publisherOrganizationId !== input.scope.organizationId) {
          return { ok: false, issue: issue("ARTIFACT_CONFLICT", "$.release", "Application release identity is already owned by another organization") };
        }
        if (
          existing.artifact.distributionDigest !== input.artifact.distributionDigest
          || existing.artifact.artifactId !== input.artifact.artifactId
          || existing.artifact.publisherId !== input.artifact.publisherId
        ) {
          return { ok: false, issue: issue("ARTIFACT_CONFLICT", "$.release", "Application id/version is immutable and already points to another release artifact") };
        }
        if (existing.artifact.status === "deprecated") {
          return { ok: false, issue: issue("ARTIFACT_DEPRECATED", "$.release", "deprecated Application release cannot be registered again") };
        }
        return { ok: true, value: existing.artifact };
      }
      releases.set(key, Object.freeze({
        artifact: input.artifact,
        signed: input.signed,
        publisherOrganizationId: input.scope.organizationId,
        publisherProjectId: input.scope.projectId,
      }));
      return { ok: true, value: input.artifact };
    },

    async getArtifact(input): Promise<ViraApplicationDeploymentResult<ViraApplicationDeploymentStoreArtifact | null>> {
      const stored = releases.get(releaseKey(input.release.id, input.release.version));
      if (stored === undefined || stored.publisherOrganizationId !== input.scope.organizationId) return { ok: true, value: null };
      return { ok: true, value: Object.freeze({ artifact: stored.artifact, signed: stored.signed }) };
    },

    async setArtifactStatus(input): Promise<ViraApplicationDeploymentResult<ViraApplicationDeploymentArtifactRecord>> {
      const key = releaseKey(input.release.id, input.release.version);
      const stored = releases.get(key);
      if (stored === undefined || stored.publisherOrganizationId !== input.scope.organizationId) {
        return { ok: false, issue: issue("ARTIFACT_NOT_FOUND", "$.release", "Application release is not registered for this organization") };
      }
      if (stored.publisherProjectId !== input.scope.projectId) {
        return { ok: false, issue: issue("ARTIFACT_NOT_FOUND", "$.scope.projectId", "only the publisher project may change release status") };
      }
      if (stored.artifact.distributionDigest !== input.distributionDigest) {
        return { ok: false, issue: issue("ARTIFACT_CONFLICT", "$.distributionDigest", "Application release digest does not match the immutable artifact") };
      }
      if (stored.artifact.status === input.status) return { ok: true, value: stored.artifact };
      const artifact = Object.freeze({ ...stored.artifact, status: input.status });
      releases.set(key, Object.freeze({ ...stored, artifact }));
      return { ok: true, value: artifact };
    },

    async getActive(input): Promise<ViraApplicationDeploymentResult<ViraApplicationDeploymentRecord | null>> {
      return { ok: true, value: active.get(activationKey(input.scope, input.applicationId)) ?? null };
    },

    async getHistorical(input): Promise<ViraApplicationDeploymentResult<ViraApplicationDeploymentRecord | null>> {
      const found = history.find((candidate) => candidate.deploymentId === input.deploymentId && exactScope(candidate.binding.scope, input.scope));
      return { ok: true, value: found ?? null };
    },

    async commitDeployment(input: ViraApplicationDeploymentCommitInput): Promise<ViraApplicationDeploymentResult<ViraApplicationDeploymentRecord>> {
      const deployment = input.deployment;
      const key = activationKey(deployment.binding.scope, deployment.release.id);
      const current = active.get(key) ?? null;
      const observedPrevious = current?.deploymentId ?? null;
      if (observedPrevious !== input.expectedPreviousDeploymentId) {
        return { ok: false, issue: issue("DEPLOYMENT_CONFLICT", "$.expectedPreviousDeploymentId", "active Application deployment changed concurrently") };
      }
      if (input.requiredSource !== undefined) {
        const source = active.get(activationKey(input.requiredSource.scope, input.requiredSource.applicationId));
        if (source?.deploymentId !== input.requiredSource.deploymentId) {
          return { ok: false, issue: issue("DEPLOYMENT_CONFLICT", "$.requiredSource", "promotion source changed concurrently") };
        }
      }
      const stored = releases.get(releaseKey(deployment.release.id, deployment.release.version));
      if (stored === undefined || stored.publisherOrganizationId !== deployment.binding.scope.organizationId) {
        return { ok: false, issue: issue("ARTIFACT_NOT_FOUND", "$.release", "deployment release is not registered for this organization") };
      }
      if (stored.artifact.status === "deprecated") {
        return { ok: false, issue: issue("ARTIFACT_DEPRECATED", "$.release", "deprecated Application release cannot be activated") };
      }
      const expectedRevision = current === null ? 1 : current.revision + 1;
      if (deployment.revision !== expectedRevision || deployment.previousDeploymentId !== (current?.deploymentId ?? undefined)) {
        return { ok: false, issue: issue("DEPLOYMENT_CONFLICT", "$.revision", "deployment revision does not extend the current activation") };
      }
      history.push(deployment);
      active.set(key, deployment);
      return { ok: true, value: deployment };
    },

    async inspect(scope): Promise<ViraApplicationDeploymentResult<ViraApplicationDeploymentInspection>> {
      const artifacts = [...releases.values()]
        .filter((value) => value.publisherOrganizationId === scope.organizationId)
        .map((value) => value.artifact);
      const scopedHistory = history.filter((deployment) => exactScope(deployment.binding.scope, scope));
      const deployments = [...active.values()].filter((deployment) => exactScope(deployment.binding.scope, scope));
      return {
        ok: true,
        value: Object.freeze({
          artifacts: Object.freeze(artifacts),
          deployments: Object.freeze(deployments),
          history: Object.freeze(scopedHistory),
        }),
      };
    },
  });
}
