import { serializeViraApplicationDistributionEnvelopeV2 } from "@vira-enterprise-genui/application-distribution";
import { parseViraApplicationReleaseReference } from "@vira-enterprise-genui/application-package";
import { createViraEnterpriseContext } from "@vira-enterprise-genui/enterprise-context";
import {
  VIRA_APPLICATION_RESOLUTION_SCHEMA_VERSION,
  type ViraApplicationResolutionArtifact,
  type ViraApplicationResolutionIssue,
  type ViraApplicationResolutionIssueCode,
  type ViraApplicationResolutionResult,
  type ViraApplicationResolutionSource,
  type ViraApplicationResolver,
  type ViraApplicationResolverCreateResult,
  type ViraApplicationResolutionDigestProvider,
} from "./types.js";

const SHA256_HEX = /^[0-9a-f]{64}$/;

function issue(
  code: ViraApplicationResolutionIssueCode,
  path: string,
  message: string,
  deploymentIssue?: ViraApplicationResolutionIssue["deploymentIssue"],
): ViraApplicationResolutionIssue {
  return Object.freeze({
    code,
    path,
    message,
    ...(deploymentIssue === undefined ? {} : { deploymentIssue }),
  });
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactScope(
  left: {
    readonly version: string;
    readonly organizationId: string;
    readonly projectId: string;
    readonly environment: string;
  },
  right: {
    readonly version: string;
    readonly organizationId: string;
    readonly projectId: string;
    readonly environment: string;
  },
): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function serializeProvenance(artifact: ViraApplicationResolutionArtifact): string {
  const principal = artifact.provenance.principal;
  return JSON.stringify({
    version: artifact.provenance.version,
    publisherId: artifact.provenance.publisherId,
    principal: {
      version: principal.version,
      kind: principal.kind,
      id: principal.id,
      organizationId: principal.organizationId,
    },
    authenticationRef: artifact.provenance.authenticationRef,
  });
}

function serializeBinding(artifact: ViraApplicationResolutionArtifact): string {
  const binding = artifact.binding;
  const secret = binding.secretRef;
  return JSON.stringify({
    version: binding.version,
    bindingRef: binding.bindingRef,
    scope: {
      version: binding.scope.version,
      organizationId: binding.scope.organizationId,
      projectId: binding.scope.projectId,
      environment: binding.scope.environment,
    },
    providerIdentityRef: binding.providerIdentityRef,
    location: binding.location,
    adapterRef: binding.adapterRef,
    secretRef: {
      version: secret.version,
      organizationId: secret.organizationId,
      projectId: secret.projectId,
      environment: secret.environment,
      provider: secret.provider,
      key: secret.key,
      ...(secret.versionRef === undefined ? {} : { versionRef: secret.versionRef }),
    },
    trustStatus: binding.trustStatus,
    trustEvidenceRef: binding.trustEvidenceRef,
  });
}

function serializeResolutionArtifact(
  artifact: ViraApplicationResolutionArtifact,
): { readonly ok: true; readonly value: string } | { readonly ok: false; readonly issue: ViraApplicationResolutionIssue } {
  const distribution = serializeViraApplicationDistributionEnvelopeV2(artifact.distribution);
  if (!distribution.ok) {
    return {
      ok: false,
      issue: issue("SOURCE_CONFLICT", "$.distribution", `active deployment carries an invalid distribution: ${distribution.issue.message}`),
    };
  }
  return {
    ok: true,
    value: `{"schemaVersion":"${VIRA_APPLICATION_RESOLUTION_SCHEMA_VERSION}","release":{"id":${JSON.stringify(artifact.release.id)},"version":${JSON.stringify(artifact.release.version)}},"environment":${JSON.stringify(artifact.environment)},"deploymentId":${JSON.stringify(artifact.deploymentId)},"deploymentRevision":${artifact.deploymentRevision},"artifactId":${JSON.stringify(artifact.artifactId)},"distributionDigest":${JSON.stringify(artifact.distributionDigest)},"publisherId":${JSON.stringify(artifact.publisherId)},"distribution":${distribution.value},"provenance":${serializeProvenance(artifact)},"binding":${serializeBinding(artifact)}}`,
  };
}

export function createViraApplicationResolver(input: {
  readonly source: ViraApplicationResolutionSource;
  readonly digest: ViraApplicationResolutionDigestProvider;
}): ViraApplicationResolverCreateResult {
  if (
    !record(input)
    || !record(input.source)
    || typeof input.source.lookupActive !== "function"
    || typeof input.digest !== "function"
  ) {
    return { ok: false, issue: issue("INVALID_RESOLVER", "$", "Application resolver requires source and digest providers") };
  }
  const source = input.source;
  const digestProvider = input.digest;
  const resolver: ViraApplicationResolver = {
    version: VIRA_APPLICATION_RESOLUTION_SCHEMA_VERSION,
    async resolve(request): Promise<ViraApplicationResolutionResult> {
      if (!record(request) || !record(request.release) || !record(request.scope)) {
        return { ok: false, issue: issue("INVALID_REQUEST", "$", "resolution request must be an exact release and enterprise scope") };
      }
      const release = parseViraApplicationReleaseReference(request.release);
      if (!release.ok) {
        return { ok: false, issue: issue("INVALID_RELEASE", "$.release", release.issue.message) };
      }
      const scopeInput = request.scope;
      const context = createViraEnterpriseContext({
        organizationId: scopeInput.organizationId,
        projectId: scopeInput.projectId,
        environments: [scopeInput.environment],
      });
      if (!context.ok) return { ok: false, issue: issue("INVALID_SCOPE", "$.scope", "resolution scope is invalid") };
      const scope = context.value.scope(scopeInput.environment);
      if (!scope.ok || !exactScope(scope.value, scopeInput)) {
        return { ok: false, issue: issue("INVALID_SCOPE", "$.scope", "resolution scope is not canonical") };
      }

      let lookup;
      try {
        lookup = await source.lookupActive({ release: release.value, environment: scope.value.environment });
      } catch {
        return { ok: false, issue: issue("SOURCE_FAILED", "$source", "Application deployment source failed closed") };
      }
      if (!lookup.ok) {
        return {
          ok: false,
          issue: issue("SOURCE_FAILED", "$source", lookup.issue.message, lookup.issue),
        };
      }
      if (lookup.value === null) {
        return { ok: false, issue: issue("APPLICATION_NOT_FOUND", "$.release", "no exact active Application deployment exists for the requested release") };
      }
      const candidate = lookup.value;
      if (candidate.artifact.status === "deprecated") {
        return { ok: false, issue: issue("APPLICATION_DEPRECATED", "$.release", "deprecated Application release cannot resolve") };
      }
      if (
        candidate.artifact.release.id !== release.value.id
        || candidate.artifact.release.version !== release.value.version
        || candidate.deployment.release.id !== release.value.id
        || candidate.deployment.release.version !== release.value.version
        || candidate.artifact.artifactId !== candidate.deployment.artifactId
        || candidate.artifact.distributionDigest !== candidate.deployment.distributionDigest
        || candidate.artifact.distribution.integrity.digest !== candidate.deployment.distributionDigest
        || candidate.artifact.publisherId !== candidate.artifact.distribution.application.publisher.id
      ) {
        return { ok: false, issue: issue("SOURCE_CONFLICT", "$source", "active Application deployment identity is internally inconsistent") };
      }
      if (!exactScope(candidate.deployment.binding.scope, scope.value)) {
        return { ok: false, issue: issue("INVALID_SCOPE", "$.scope", "active Application deployment belongs to another enterprise scope") };
      }
      if (candidate.deployment.binding.trustStatus !== "trusted") {
        return { ok: false, issue: issue("UNTRUSTED_BINDING", "$source.binding.trustStatus", "active Application deployment binding is not trusted") };
      }
      const artifact: ViraApplicationResolutionArtifact = Object.freeze({
        schemaVersion: VIRA_APPLICATION_RESOLUTION_SCHEMA_VERSION,
        release: release.value,
        environment: scope.value.environment,
        deploymentId: candidate.deployment.deploymentId,
        deploymentRevision: candidate.deployment.revision,
        artifactId: candidate.artifact.artifactId,
        distributionDigest: candidate.artifact.distributionDigest,
        publisherId: candidate.artifact.publisherId,
        distribution: candidate.artifact.distribution,
        provenance: candidate.artifact.provenance,
        binding: candidate.deployment.binding,
      });
      const serialized = serializeResolutionArtifact(artifact);
      if (!serialized.ok) return serialized;
      let resolutionDigest: unknown;
      try {
        resolutionDigest = await digestProvider(serialized.value);
      } catch {
        return { ok: false, issue: issue("DIGEST_PROVIDER_FAILED", "$digest", "resolution digest provider failed closed") };
      }
      if (typeof resolutionDigest !== "string" || !SHA256_HEX.test(resolutionDigest)) {
        return { ok: false, issue: issue("INVALID_RESOLUTION_DIGEST", "$digest", "resolution digest must be exactly 64 lowercase hexadecimal characters") };
      }
      return {
        ok: true,
        value: Object.freeze({
          artifact,
          canonicalArtifact: serialized.value,
          resolutionDigest,
        }),
      };
    },
  };
  return { ok: true, value: Object.freeze(resolver) };
}
