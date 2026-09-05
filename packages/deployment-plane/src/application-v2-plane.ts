import {
  verifyViraApplicationDistributionIntegrityV2,
  type ViraApplicationDistributionEnvelopeV2,
} from "@vira-enterprise-genui/application-distribution";
import {
  parseViraApplicationReleaseReference,
  type ViraApplicationReleaseReference,
} from "@vira-enterprise-genui/application-package";
import {
  createViraEnterpriseContext,
  VIRA_ENTERPRISE_PRINCIPAL_KINDS,
  type ViraEnterprisePrincipal,
  type ViraEnterpriseScope,
} from "@vira-enterprise-genui/enterprise-context";
import { createInMemoryApplicationDeploymentStateStore } from "./application-v2-memory-store.js";
import {
  VIRA_DEPLOYMENT_ENVIRONMENTS,
  VIRA_DEPLOYMENT_SIGNATURE_ALGORITHMS,
  type ViraArtifactSignature,
  type ViraDeploymentEnvironment,
} from "./types.js";
import {
  VIRA_APPLICATION_DEPLOYMENT_ARTIFACT_KIND,
  VIRA_APPLICATION_DEPLOYMENT_VERSION,
  VIRA_APPLICATION_ENVIRONMENT_BINDING_VERSION,
  VIRA_APPLICATION_PUBLISHER_PROVENANCE_VERSION,
  VIRA_APPLICATION_TRUST_STATUSES,
  type ViraApplicationDeploymentArtifactRecord,
  type ViraApplicationDeploymentCandidate,
  type ViraApplicationDeploymentIssue,
  type ViraApplicationDeploymentIssueCode,
  type ViraApplicationDeploymentPlane,
  type ViraApplicationDeploymentPlaneCreateResult,
  type ViraApplicationDeploymentRecord,
  type ViraApplicationDeploymentResult,
  type ViraApplicationDeploymentStateStore,
  type ViraApplicationDeploymentStoreArtifact,
  type ViraApplicationDeploymentTrustProvider,
  type ViraApplicationEnvironmentBinding,
  type ViraAuthenticatedPublisherProvenance,
  type ViraSignedApplicationDistribution,
} from "./application-v2-types.js";

const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const DIGEST = /^[0-9a-f]{64}$/;
const REF = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/;
const SIGNATURE = /^[A-Za-z0-9_-]{16,4096}$/;

function issue(code: ViraApplicationDeploymentIssueCode, path: string, message: string): ViraApplicationDeploymentIssue {
  return Object.freeze({ code, path, message });
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, fields: readonly string[]): boolean {
  const allowed = new Set(fields);
  return Object.keys(value).length === fields.length
    && fields.every((field) => Object.hasOwn(value, field))
    && Object.keys(value).every((field) => allowed.has(field));
}

function onlyKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every((field) => Object.hasOwn(value, field))
    && Object.keys(value).every((field) => allowed.has(field));
}

function safeText(value: unknown, max = 512): value is string {
  if (typeof value !== "string" || value.length < 1 || value.length > max || value.trim() !== value) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return false;
  }
  return true;
}

function exactScope(left: ViraEnterpriseScope, right: ViraEnterpriseScope): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function canonicalScope(input: unknown): ViraApplicationDeploymentResult<ViraEnterpriseScope> {
  if (!record(input) || !exactKeys(input, ["version", "organizationId", "projectId", "environment"])) {
    return { ok: false, issue: issue("INVALID_BINDING", "$.scope", "enterprise scope must be an exact object") };
  }
  const candidate = input as unknown as ViraEnterpriseScope;
  const context = createViraEnterpriseContext({
    organizationId: candidate.organizationId,
    projectId: candidate.projectId,
    environments: [candidate.environment],
  });
  if (!context.ok) return { ok: false, issue: issue("INVALID_BINDING", "$.scope", "enterprise scope is invalid") };
  const scoped = context.value.scope(candidate.environment);
  if (!scoped.ok || !exactScope(scoped.value, candidate)) {
    return { ok: false, issue: issue("INVALID_BINDING", "$.scope", "enterprise scope is not canonical") };
  }
  return { ok: true, value: scoped.value };
}

function scopeForEnvironment(scope: ViraEnterpriseScope, environment: ViraDeploymentEnvironment): ViraApplicationDeploymentResult<ViraEnterpriseScope> {
  const context = createViraEnterpriseContext({
    organizationId: scope.organizationId,
    projectId: scope.projectId,
    environments: [environment],
  });
  if (!context.ok) return { ok: false, issue: issue("INVALID_BINDING", "$.scope", "deployment scope lineage is invalid") };
  const scoped = context.value.scope(environment);
  if (!scoped.ok) return { ok: false, issue: issue("INVALID_BINDING", "$.scope.environment", "deployment environment is invalid") };
  return { ok: true, value: scoped.value };
}

function validSignature(input: unknown): input is ViraArtifactSignature {
  if (!record(input) || !exactKeys(input, ["algorithm", "keyId", "value"])) return false;
  return typeof input.algorithm === "string"
    && VIRA_DEPLOYMENT_SIGNATURE_ALGORITHMS.includes(input.algorithm as ViraArtifactSignature["algorithm"])
    && typeof input.keyId === "string"
    && REF.test(input.keyId)
    && typeof input.value === "string"
    && SIGNATURE.test(input.value);
}

function validPrincipal(input: unknown): input is ViraEnterprisePrincipal {
  if (!record(input) || !exactKeys(input, ["version", "kind", "id", "organizationId"])) return false;
  return input.version === "1"
    && typeof input.kind === "string"
    && VIRA_ENTERPRISE_PRINCIPAL_KINDS.includes(input.kind as ViraEnterprisePrincipal["kind"])
    && typeof input.id === "string"
    && REF.test(input.id)
    && typeof input.organizationId === "string"
    && REF.test(input.organizationId);
}

function normalizeProvenance(input: unknown): ViraApplicationDeploymentResult<ViraAuthenticatedPublisherProvenance> {
  if (!record(input) || !exactKeys(input, ["version", "publisherId", "principal", "authenticationRef"])) {
    return { ok: false, issue: issue("PUBLISHER_PROVENANCE_INVALID", "$.provenance", "publisher provenance must be an exact object") };
  }
  if (
    input.version !== VIRA_APPLICATION_PUBLISHER_PROVENANCE_VERSION
    || typeof input.publisherId !== "string"
    || !REF.test(input.publisherId)
    || !validPrincipal(input.principal)
    || typeof input.authenticationRef !== "string"
    || !REF.test(input.authenticationRef)
  ) {
    return { ok: false, issue: issue("PUBLISHER_PROVENANCE_INVALID", "$.provenance", "publisher provenance is invalid") };
  }
  return {
    ok: true,
    value: Object.freeze({
      version: VIRA_APPLICATION_PUBLISHER_PROVENANCE_VERSION,
      publisherId: input.publisherId,
      principal: Object.freeze({ ...input.principal }),
      authenticationRef: input.authenticationRef,
    }),
  };
}

function normalizeBinding(input: unknown, environment: ViraDeploymentEnvironment): ViraApplicationDeploymentResult<ViraApplicationEnvironmentBinding> {
  const fields = [
    "version", "bindingRef", "scope", "providerIdentityRef", "location", "adapterRef", "secretRef", "trustStatus", "trustEvidenceRef",
  ] as const;
  if (!record(input) || !exactKeys(input, fields) || !record(input.scope) || !record(input.secretRef)) {
    return { ok: false, issue: issue("INVALID_BINDING", "$.binding", "environment binding must be an exact object") };
  }
  if (
    input.version !== VIRA_APPLICATION_ENVIRONMENT_BINDING_VERSION
    || typeof input.bindingRef !== "string" || !REF.test(input.bindingRef)
    || typeof input.providerIdentityRef !== "string" || !REF.test(input.providerIdentityRef)
    || !safeText(input.location, 256)
    || typeof input.adapterRef !== "string" || !REF.test(input.adapterRef)
    || typeof input.trustStatus !== "string"
    || !VIRA_APPLICATION_TRUST_STATUSES.includes(input.trustStatus as ViraApplicationEnvironmentBinding["trustStatus"])
    || typeof input.trustEvidenceRef !== "string" || !REF.test(input.trustEvidenceRef)
  ) {
    return { ok: false, issue: issue("INVALID_BINDING", "$.binding", "environment binding metadata is invalid") };
  }
  const scope = canonicalScope(input.scope);
  if (!scope.ok) return { ok: false, issue: issue("INVALID_BINDING", "$.binding.scope", scope.issue.message) };
  if (scope.value.environment !== environment) {
    return { ok: false, issue: issue("INVALID_BINDING", "$.binding.scope.environment", "binding scope must match target deployment environment") };
  }
  const context = createViraEnterpriseContext({
    organizationId: scope.value.organizationId,
    projectId: scope.value.projectId,
    environments: [scope.value.environment],
  });
  if (!context.ok) return { ok: false, issue: issue("INVALID_BINDING", "$.binding.scope", "binding scope is invalid") };
  const secret = context.value.secretRef(input.secretRef);
  if (!secret.ok) return { ok: false, issue: issue("INVALID_BINDING", "$.binding.secretRef", "binding secretRef is invalid or cross-scope") };
  if (input.trustStatus !== "trusted") {
    return { ok: false, issue: issue("UNTRUSTED_BINDING", "$.binding.trustStatus", "only trusted environment bindings can be activated") };
  }
  return {
    ok: true,
    value: Object.freeze({
      version: VIRA_APPLICATION_ENVIRONMENT_BINDING_VERSION,
      bindingRef: input.bindingRef,
      scope: scope.value,
      providerIdentityRef: input.providerIdentityRef,
      location: input.location,
      adapterRef: input.adapterRef,
      secretRef: secret.value,
      trustStatus: "trusted",
      trustEvidenceRef: input.trustEvidenceRef,
    }),
  };
}

function exactRelease(left: ViraApplicationReleaseReference, right: ViraApplicationReleaseReference): boolean {
  return left.id === right.id && left.version === right.version;
}

function artifactId(release: ViraApplicationReleaseReference, digest: string): string {
  return `application-artifact:${release.id}:${release.version}:${digest}`;
}

function canonicalAttestation(distribution: ViraApplicationDistributionEnvelopeV2, provenance: ViraAuthenticatedPublisherProvenance): string {
  const principal = provenance.principal;
  return JSON.stringify({
    artifactKind: VIRA_APPLICATION_DEPLOYMENT_ARTIFACT_KIND,
    applicationId: distribution.application.identity.id,
    applicationVersion: distribution.application.version,
    distributionDigest: distribution.integrity.digest,
    publisherId: provenance.publisherId,
    principal: {
      version: principal.version,
      kind: principal.kind,
      id: principal.id,
      organizationId: principal.organizationId,
    },
    authenticationRef: provenance.authenticationRef,
  });
}

interface VerifiedArtifact {
  readonly signed: ViraSignedApplicationDistribution;
  readonly record: ViraApplicationDeploymentArtifactRecord;
}

async function verifyArtifact(input: unknown, trust: ViraApplicationDeploymentTrustProvider): Promise<ViraApplicationDeploymentResult<VerifiedArtifact>> {
  if (
    !record(input)
    || !exactKeys(input, ["version", "artifactKind", "distribution", "provenance", "signature"])
    || input.version !== VIRA_APPLICATION_DEPLOYMENT_VERSION
    || input.artifactKind !== VIRA_APPLICATION_DEPLOYMENT_ARTIFACT_KIND
  ) {
    return { ok: false, issue: issue("INVALID_ARTIFACT", "$", "signed Application distribution envelope is invalid") };
  }
  const verifiedDistribution = await verifyViraApplicationDistributionIntegrityV2(input.distribution, trust.verifyDistributionIntegrity);
  if (!verifiedDistribution.ok) {
    const code = verifiedDistribution.issue.code === "INTEGRITY_VERIFICATION_FAILED" || verifiedDistribution.issue.code === "INTEGRITY_VERIFIER_FAILED"
      ? "DISTRIBUTION_INTEGRITY_FAILED"
      : "DISTRIBUTION_INVALID";
    return { ok: false, issue: issue(code, `$.distribution${verifiedDistribution.issue.path === "$" ? "" : verifiedDistribution.issue.path.slice(1)}`, verifiedDistribution.issue.message) };
  }
  const provenance = normalizeProvenance(input.provenance);
  if (!provenance.ok) return provenance;
  const application = verifiedDistribution.value.application;
  if (provenance.value.publisherId !== application.publisher.id) {
    return { ok: false, issue: issue("PUBLISHER_MISMATCH", "$.provenance.publisherId", "authenticated publisher must exactly match Application publisher") };
  }
  let authenticated: boolean;
  try {
    authenticated = await trust.verifyPublisherProvenance({
      applicationId: application.identity.id,
      applicationVersion: application.version,
      publisherId: provenance.value.publisherId,
      principal: provenance.value.principal,
      authenticationRef: provenance.value.authenticationRef,
    });
  } catch {
    return { ok: false, issue: issue("PUBLISHER_AUTHENTICATION_FAILED", "$.provenance", "publisher provenance verification failed closed") };
  }
  if (authenticated !== true) {
    return { ok: false, issue: issue("PUBLISHER_AUTHENTICATION_FAILED", "$.provenance", "publisher provenance is not authenticated") };
  }
  if (!validSignature(input.signature)) {
    return { ok: false, issue: issue("INVALID_ARTIFACT", "$.signature", "Application release signature envelope is invalid") };
  }
  let signatureValid: boolean;
  try {
    signatureValid = await trust.verifySignature({
      canonicalAttestation: canonicalAttestation(verifiedDistribution.value, provenance.value),
      signature: input.signature,
    });
  } catch {
    return { ok: false, issue: issue("SIGNATURE_INVALID", "$.signature", "Application release signature verification failed closed") };
  }
  if (signatureValid !== true) {
    return { ok: false, issue: issue("SIGNATURE_INVALID", "$.signature", "Application release signature verification failed closed") };
  }
  const release = Object.freeze({ id: application.identity.id, version: application.version });
  const signature = Object.freeze({ ...input.signature }) as ViraArtifactSignature;
  const signed: ViraSignedApplicationDistribution = Object.freeze({
    version: VIRA_APPLICATION_DEPLOYMENT_VERSION,
    artifactKind: VIRA_APPLICATION_DEPLOYMENT_ARTIFACT_KIND,
    distribution: verifiedDistribution.value,
    provenance: provenance.value,
    signature,
  });
  const artifact: ViraApplicationDeploymentArtifactRecord = Object.freeze({
    artifactId: artifactId(release, verifiedDistribution.value.integrity.digest),
    artifactKind: VIRA_APPLICATION_DEPLOYMENT_ARTIFACT_KIND,
    release,
    distributionDigest: verifiedDistribution.value.integrity.digest,
    publisherId: provenance.value.publisherId,
    distribution: verifiedDistribution.value,
    provenance: provenance.value,
    signature,
    status: "active",
  });
  return { ok: true, value: Object.freeze({ signed, record: artifact }) };
}

function validTrustProvider(input: unknown): input is ViraApplicationDeploymentTrustProvider {
  return record(input)
    && typeof input.verifyDistributionIntegrity === "function"
    && typeof input.verifyPublisherProvenance === "function"
    && typeof input.verifySignature === "function";
}

function validStore(input: unknown): input is ViraApplicationDeploymentStateStore {
  return record(input)
    && typeof input.registerArtifact === "function"
    && typeof input.getArtifact === "function"
    && typeof input.setArtifactStatus === "function"
    && typeof input.getActive === "function"
    && typeof input.getHistorical === "function"
    && typeof input.commitDeployment === "function"
    && typeof input.inspect === "function";
}

function adjacentPromotion(from: ViraDeploymentEnvironment, to: ViraDeploymentEnvironment): boolean {
  return (from === "dev" && to === "staging") || (from === "staging" && to === "production");
}

function sameStoredArtifact(stored: ViraApplicationDeploymentStoreArtifact, verified: VerifiedArtifact): boolean {
  return stored.artifact.artifactId === verified.record.artifactId
    && stored.artifact.distributionDigest === verified.record.distributionDigest
    && stored.artifact.publisherId === verified.record.publisherId
    && stored.signed.provenance.publisherId === verified.signed.provenance.publisherId
    && stored.signed.provenance.authenticationRef === verified.signed.provenance.authenticationRef
    && stored.signed.provenance.principal.kind === verified.signed.provenance.principal.kind
    && stored.signed.provenance.principal.id === verified.signed.provenance.principal.id
    && stored.signed.provenance.principal.organizationId === verified.signed.provenance.principal.organizationId
    && stored.signed.signature.algorithm === verified.signed.signature.algorithm
    && stored.signed.signature.keyId === verified.signed.signature.keyId
    && stored.signed.signature.value === verified.signed.signature.value;
}

export function createViraApplicationDeploymentPlane(input: {
  readonly trust: ViraApplicationDeploymentTrustProvider;
  readonly store?: ViraApplicationDeploymentStateStore;
}): ViraApplicationDeploymentPlaneCreateResult {
  if (!record(input) || !onlyKeys(input, ["trust"], ["store"]) || !validTrustProvider(input.trust)) {
    return { ok: false, issue: issue("INVALID_PLANE", "$", "Application deployment plane requires a trust provider") };
  }
  if (input.store !== undefined && !validStore(input.store)) {
    return { ok: false, issue: issue("INVALID_PLANE", "$.store", "Application deployment state store is invalid") };
  }
  const trust = input.trust;
  const store = input.store ?? createInMemoryApplicationDeploymentStateStore();
  let mutationTail: Promise<void> = Promise.resolve();

  const enqueue = <T>(work: () => Promise<ViraApplicationDeploymentResult<T>>): Promise<ViraApplicationDeploymentResult<T>> => {
    const run = mutationTail.then(work, work);
    mutationTail = run.then(() => undefined, () => undefined);
    return run;
  };

  const nextDeployment = (
    artifact: ViraApplicationDeploymentArtifactRecord,
    binding: ViraApplicationEnvironmentBinding,
    operation: ViraApplicationDeploymentRecord["operation"],
    current: ViraApplicationDeploymentRecord | null,
  ): ViraApplicationDeploymentResult<ViraApplicationDeploymentRecord> => {
    if (current?.artifactId === artifact.artifactId && current.binding.bindingRef === binding.bindingRef) {
      return { ok: true, value: current };
    }
    const revision = current === null ? 1 : current.revision + 1;
    if (!Number.isSafeInteger(revision) || revision < 1 || revision > MAX_SAFE) {
      return { ok: false, issue: issue("INVALID_PLANE", "$.revision", "deployment revision overflow") };
    }
    return {
      ok: true,
      value: Object.freeze({
        deploymentId: `application-deployment:${binding.scope.organizationId}:${binding.scope.projectId}:${binding.scope.environment}:${artifact.release.id}:${revision}`,
        environment: binding.scope.environment,
        revision,
        artifactId: artifact.artifactId,
        release: artifact.release,
        distributionDigest: artifact.distributionDigest,
        binding,
        operation,
        ...(current === null ? {} : { previousDeploymentId: current.deploymentId }),
      }),
    };
  };

  const loadVerified = async (
    scope: ViraEnterpriseScope,
    release: ViraApplicationReleaseReference,
  ): Promise<ViraApplicationDeploymentResult<ViraApplicationDeploymentStoreArtifact>> => {
    const loaded = await store.getArtifact({ scope, release });
    if (!loaded.ok) return loaded;
    if (loaded.value === null) return { ok: false, issue: issue("ARTIFACT_NOT_FOUND", "$.release", "Application release is not registered") };
    if (loaded.value.artifact.status === "deprecated") {
      return { ok: false, issue: issue("ARTIFACT_DEPRECATED", "$.release", "deprecated Application release cannot be activated") };
    }
    const verified = await verifyArtifact(loaded.value.signed, trust);
    if (!verified.ok) return verified;
    if (!sameStoredArtifact(loaded.value, verified.value)) {
      return { ok: false, issue: issue("ARTIFACT_CONFLICT", "$.release", "stored Application release does not match its authenticated signed artifact") };
    }
    return loaded as ViraApplicationDeploymentResult<ViraApplicationDeploymentStoreArtifact>;
  };

  const plane: ViraApplicationDeploymentPlane = {
    version: VIRA_APPLICATION_DEPLOYMENT_VERSION,

    publish(request) {
      return enqueue(async () => {
        if (!record(request) || !exactKeys(request, ["artifact", "binding"])) {
          return { ok: false, issue: issue("INVALID_ARTIFACT", "$", "publish request is invalid") };
        }
        const verified = await verifyArtifact(request.artifact, trust);
        if (!verified.ok) return verified;
        const binding = normalizeBinding(request.binding, "dev");
        if (!binding.ok) return binding;
        if (verified.value.record.provenance.principal.organizationId !== binding.value.scope.organizationId) {
          return { ok: false, issue: issue("PUBLISHER_MISMATCH", "$.binding.scope.organizationId", "authenticated publisher organization must match deployment organization") };
        }
        const registered = await store.registerArtifact({ scope: binding.value.scope, artifact: verified.value.record, signed: verified.value.signed });
        if (!registered.ok) return registered;
        const current = await store.getActive({ scope: binding.value.scope, applicationId: registered.value.release.id });
        if (!current.ok) return current;
        const deployment = nextDeployment(registered.value, binding.value, "publish", current.value);
        if (!deployment.ok || deployment.value === current.value) return deployment;
        return store.commitDeployment({
          deployment: deployment.value,
          expectedPreviousDeploymentId: current.value?.deploymentId ?? null,
        });
      });
    },

    promote(promotion) {
      return enqueue(async () => {
        if (
          !record(promotion)
          || !exactKeys(promotion, ["release", "distributionDigest", "from", "to", "binding"])
          || !VIRA_DEPLOYMENT_ENVIRONMENTS.includes(promotion.from)
          || !VIRA_DEPLOYMENT_ENVIRONMENTS.includes(promotion.to)
          || !adjacentPromotion(promotion.from, promotion.to)
          || typeof promotion.distributionDigest !== "string"
          || !DIGEST.test(promotion.distributionDigest)
        ) {
          return { ok: false, issue: issue("INVALID_PROMOTION", "$", "promotion must move one exact Application release one adjacent environment forward") };
        }
        const release = parseViraApplicationReleaseReference(promotion.release);
        if (!release.ok) return { ok: false, issue: issue("INVALID_PROMOTION", "$.release", release.issue.message) };
        const binding = normalizeBinding(promotion.binding, promotion.to);
        if (!binding.ok) return binding;
        const stored = await loadVerified(binding.value.scope, release.value);
        if (!stored.ok) return stored;
        if (stored.value.artifact.distributionDigest !== promotion.distributionDigest) {
          return { ok: false, issue: issue("ARTIFACT_CONFLICT", "$.distributionDigest", "promotion digest does not match the immutable Application release") };
        }
        if (stored.value.artifact.provenance.principal.organizationId !== binding.value.scope.organizationId) {
          return { ok: false, issue: issue("PUBLISHER_MISMATCH", "$.binding.scope.organizationId", "authenticated publisher organization must match deployment organization") };
        }
        const sourceScope = scopeForEnvironment(binding.value.scope, promotion.from);
        if (!sourceScope.ok) return sourceScope;
        const source = await store.getActive({ scope: sourceScope.value, applicationId: release.value.id });
        if (!source.ok) return source;
        if (
          source.value === null
          || source.value.artifactId !== stored.value.artifact.artifactId
          || source.value.distributionDigest !== promotion.distributionDigest
          || !exactRelease(source.value.release, release.value)
        ) {
          return { ok: false, issue: issue("INVALID_PROMOTION", "$.from", "source tenant environment does not run the exact requested Application release") };
        }
        const current = await store.getActive({ scope: binding.value.scope, applicationId: release.value.id });
        if (!current.ok) return current;
        const deployment = nextDeployment(stored.value.artifact, binding.value, "promote", current.value);
        if (!deployment.ok || deployment.value === current.value) return deployment;
        return store.commitDeployment({
          deployment: deployment.value,
          expectedPreviousDeploymentId: current.value?.deploymentId ?? null,
          requiredSource: Object.freeze({
            scope: sourceScope.value,
            applicationId: release.value.id,
            deploymentId: source.value.deploymentId,
          }),
        });
      });
    },

    rollback(inputValue) {
      return enqueue(async () => {
        if (!record(inputValue) || !exactKeys(inputValue, ["scope", "deploymentId"]) || typeof inputValue.deploymentId !== "string") {
          return { ok: false, issue: issue("INVALID_ROLLBACK", "$", "rollback input is invalid") };
        }
        const scope = canonicalScope(inputValue.scope);
        if (!scope.ok) return { ok: false, issue: issue("INVALID_ROLLBACK", "$.scope", scope.issue.message) };
        const target = await store.getHistorical({ scope: scope.value, deploymentId: inputValue.deploymentId });
        if (!target.ok) return target;
        if (target.value === null) {
          return { ok: false, issue: issue("INVALID_ROLLBACK", "$.deploymentId", "rollback target is not historical state for this tenant environment") };
        }
        const binding = normalizeBinding(target.value.binding, scope.value.environment);
        if (!binding.ok || !exactScope(binding.value.scope, scope.value)) {
          return { ok: false, issue: issue("INVALID_ROLLBACK", "$.deploymentId", "rollback target binding is not valid for this tenant environment") };
        }
        const stored = await loadVerified(scope.value, target.value.release);
        if (!stored.ok) return stored;
        if (
          stored.value.artifact.artifactId !== target.value.artifactId
          || stored.value.artifact.distributionDigest !== target.value.distributionDigest
        ) {
          return { ok: false, issue: issue("ARTIFACT_CONFLICT", "$.deploymentId", "rollback history no longer matches the immutable release") };
        }
        const current = await store.getActive({ scope: scope.value, applicationId: target.value.release.id });
        if (!current.ok) return current;
        const deployment = nextDeployment(stored.value.artifact, binding.value, "rollback", current.value);
        if (!deployment.ok || deployment.value === current.value) return deployment;
        return store.commitDeployment({
          deployment: deployment.value,
          expectedPreviousDeploymentId: current.value?.deploymentId ?? null,
        });
      });
    },

    deprecate(inputValue) {
      return enqueue(async () => {
        if (
          !record(inputValue)
          || !exactKeys(inputValue, ["scope", "release", "distributionDigest"])
          || typeof inputValue.distributionDigest !== "string"
          || !DIGEST.test(inputValue.distributionDigest)
        ) {
          return { ok: false, issue: issue("ARTIFACT_NOT_FOUND", "$", "Application release identity is invalid") };
        }
        const scope = canonicalScope(inputValue.scope);
        if (!scope.ok) return { ok: false, issue: issue("ARTIFACT_NOT_FOUND", "$.scope", scope.issue.message) };
        const release = parseViraApplicationReleaseReference(inputValue.release);
        if (!release.ok) return { ok: false, issue: issue("ARTIFACT_NOT_FOUND", "$.release", release.issue.message) };
        const stored = await store.getArtifact({ scope: scope.value, release: release.value });
        if (!stored.ok) return stored;
        if (stored.value === null) return { ok: false, issue: issue("ARTIFACT_NOT_FOUND", "$.release", "Application release is not registered") };
        if (stored.value.artifact.distributionDigest !== inputValue.distributionDigest) {
          return { ok: false, issue: issue("ARTIFACT_CONFLICT", "$.distributionDigest", "deprecation digest does not match the immutable release") };
        }
        return store.setArtifactStatus({
          scope: scope.value,
          release: release.value,
          distributionDigest: inputValue.distributionDigest,
          status: "deprecated",
        });
      });
    },

    async inspect(scopeInput) {
      const scope = canonicalScope(scopeInput);
      if (!scope.ok) return scope;
      return store.inspect(scope.value);
    },

    async verifyCachedApplication(inputValue) {
      if (!record(inputValue) || !exactKeys(inputValue, ["scope", "artifact"])) {
        return { ok: false, issue: issue("INVALID_ARTIFACT", "$", "cached Application verification input is invalid") };
      }
      const scope = canonicalScope(inputValue.scope);
      if (!scope.ok) return { ok: false, issue: issue("INVALID_BINDING", "$.scope", scope.issue.message) };
      const verified = await verifyArtifact(inputValue.artifact, trust);
      if (!verified.ok) return verified;
      if (verified.value.record.provenance.principal.organizationId !== scope.value.organizationId) {
        return { ok: false, issue: issue("PUBLISHER_MISMATCH", "$.scope.organizationId", "cached release belongs to another publisher organization") };
      }
      const stored = await store.getArtifact({ scope: scope.value, release: verified.value.record.release });
      if (!stored.ok) return stored;
      if (stored.value === null) return { ok: true, value: verified.value.record };
      if (stored.value.artifact.status === "deprecated") {
        return { ok: false, issue: issue("ARTIFACT_DEPRECATED", "$.release", "deprecated Application release is not accepted for cache verification") };
      }
      if (!sameStoredArtifact(stored.value, verified.value)) {
        return { ok: false, issue: issue("ARTIFACT_CONFLICT", "$.release", "cached Application conflicts with the immutable registered release") };
      }
      return { ok: true, value: stored.value.artifact };
    },

    async lookupActive(inputValue): Promise<ViraApplicationDeploymentResult<ViraApplicationDeploymentCandidate | null>> {
      if (!record(inputValue) || !exactKeys(inputValue, ["release", "scope"])) {
        return { ok: false, issue: issue("ARTIFACT_NOT_FOUND", "$", "Application lookup input is invalid") };
      }
      const release = parseViraApplicationReleaseReference(inputValue.release);
      if (!release.ok) return { ok: false, issue: issue("ARTIFACT_NOT_FOUND", "$.release", release.issue.message) };
      const scope = canonicalScope(inputValue.scope);
      if (!scope.ok) return { ok: false, issue: issue("INVALID_BINDING", "$.scope", scope.issue.message) };
      const deployment = await store.getActive({ scope: scope.value, applicationId: release.value.id });
      if (!deployment.ok) return deployment;
      if (deployment.value === null || !exactRelease(deployment.value.release, release.value)) return { ok: true, value: null };
      const stored = await store.getArtifact({ scope: scope.value, release: release.value });
      if (!stored.ok) return stored;
      if (stored.value === null) return { ok: false, issue: issue("ARTIFACT_NOT_FOUND", "$.release", "active deployment points to a missing Application release") };
      if (
        stored.value.artifact.status === "deprecated"
        || stored.value.artifact.artifactId !== deployment.value.artifactId
        || stored.value.artifact.distributionDigest !== deployment.value.distributionDigest
      ) {
        if (stored.value.artifact.status === "deprecated") {
          return { ok: false, issue: issue("ARTIFACT_DEPRECATED", "$.release", "active deployment points to a deprecated Application release") };
        }
        return { ok: false, issue: issue("ARTIFACT_CONFLICT", "$.release", "active deployment does not match the immutable Application release") };
      }
      return { ok: true, value: Object.freeze({ artifact: stored.value.artifact, deployment: deployment.value }) };
    },
  };

  return { ok: true, value: Object.freeze(plane) };
}
