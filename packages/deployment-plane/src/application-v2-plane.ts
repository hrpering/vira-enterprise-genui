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
  type ViraApplicationDeploymentInspection,
  type ViraApplicationDeploymentIssue,
  type ViraApplicationDeploymentIssueCode,
  type ViraApplicationDeploymentPlane,
  type ViraApplicationDeploymentPlaneCreateResult,
  type ViraApplicationDeploymentRecord,
  type ViraApplicationDeploymentResult,
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

function safeText(value: unknown, max = 512): value is string {
  if (typeof value !== "string" || value.length < 1 || value.length > max || value.trim() !== value) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return false;
  }
  return true;
}

function exactKeys(value: Record<string, unknown>, fields: readonly string[]): boolean {
  const allowed = new Set(fields);
  return Object.keys(value).length === fields.length
    && fields.every((field) => Object.hasOwn(value, field))
    && Object.keys(value).every((field) => allowed.has(field));
}

function exactScope(left: ViraEnterpriseScope, right: ViraEnterpriseScope): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
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

function normalizeBinding(
  input: unknown,
  environment: ViraDeploymentEnvironment,
): ViraApplicationDeploymentResult<ViraApplicationEnvironmentBinding> {
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
  const scopeInput = input.scope as unknown as ViraApplicationEnvironmentBinding["scope"];
  if (scopeInput.environment !== environment) {
    return { ok: false, issue: issue("INVALID_BINDING", "$.binding.scope.environment", "binding scope must match target deployment environment") };
  }
  const context = createViraEnterpriseContext({
    organizationId: scopeInput.organizationId,
    projectId: scopeInput.projectId,
    environments: [scopeInput.environment],
  });
  if (!context.ok) return { ok: false, issue: issue("INVALID_BINDING", "$.binding.scope", "binding scope is invalid") };
  const scope = context.value.scope(scopeInput.environment);
  if (!scope.ok || !exactScope(scope.value, scopeInput)) {
    return { ok: false, issue: issue("INVALID_BINDING", "$.binding.scope", "binding scope is not canonical") };
  }
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

function versionKey(release: ViraApplicationReleaseReference): string {
  return `${release.id}@${release.version}`;
}

function artifactKey(release: ViraApplicationReleaseReference, digest: string): string {
  return `${versionKey(release)}#${digest}`;
}

function artifactId(release: ViraApplicationReleaseReference, digest: string): string {
  return `application-artifact:${release.id}:${release.version}:${digest}`;
}

function canonicalAttestation(
  distribution: ViraApplicationDistributionEnvelopeV2,
  provenance: ViraAuthenticatedPublisherProvenance,
): string {
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

async function verifyArtifact(
  input: unknown,
  trust: ViraApplicationDeploymentTrustProvider,
): Promise<ViraApplicationDeploymentResult<VerifiedArtifact>> {
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
  let publisherAuthenticated: boolean;
  try {
    publisherAuthenticated = await trust.verifyPublisherProvenance({
      applicationId: application.identity.id,
      applicationVersion: application.version,
      publisherId: provenance.value.publisherId,
      principal: provenance.value.principal,
      authenticationRef: provenance.value.authenticationRef,
    });
  } catch {
    return { ok: false, issue: issue("PUBLISHER_AUTHENTICATION_FAILED", "$.provenance", "publisher provenance verification failed closed") };
  }
  if (publisherAuthenticated !== true) {
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
  const normalizedSigned: ViraSignedApplicationDistribution = Object.freeze({
    version: VIRA_APPLICATION_DEPLOYMENT_VERSION,
    artifactKind: VIRA_APPLICATION_DEPLOYMENT_ARTIFACT_KIND,
    distribution: verifiedDistribution.value,
    provenance: provenance.value,
    signature,
  });
  const resultRecord: ViraApplicationDeploymentArtifactRecord = Object.freeze({
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
  return { ok: true, value: Object.freeze({ signed: normalizedSigned, record: resultRecord }) };
}

function validTrustProvider(input: unknown): input is ViraApplicationDeploymentTrustProvider {
  return record(input)
    && typeof input.verifyDistributionIntegrity === "function"
    && typeof input.verifyPublisherProvenance === "function"
    && typeof input.verifySignature === "function";
}

function adjacentPromotion(from: ViraDeploymentEnvironment, to: ViraDeploymentEnvironment): boolean {
  return (from === "dev" && to === "staging") || (from === "staging" && to === "production");
}

export function createViraApplicationDeploymentPlane(input: {
  readonly trust: ViraApplicationDeploymentTrustProvider;
}): ViraApplicationDeploymentPlaneCreateResult {
  if (!record(input) || !exactKeys(input, ["trust"]) || !validTrustProvider(input.trust)) {
    return { ok: false, issue: issue("INVALID_PLANE", "$", "Application deployment plane requires a trust provider") };
  }
  const trust = input.trust;
  const artifacts = new Map<string, ViraApplicationDeploymentArtifactRecord>();
  const signedArtifacts = new Map<string, ViraSignedApplicationDistribution>();
  const digestByVersion = new Map<string, string>();
  const deployments = new Map<ViraDeploymentEnvironment, ViraApplicationDeploymentRecord | null>([
    ["dev", null], ["staging", null], ["production", null],
  ]);
  const history: ViraApplicationDeploymentRecord[] = [];
  let mutationTail: Promise<void> = Promise.resolve();

  const enqueue = <T>(work: () => Promise<ViraApplicationDeploymentResult<T>>): Promise<ViraApplicationDeploymentResult<T>> => {
    const run = mutationTail.then(work, work);
    mutationTail = run.then(() => undefined, () => undefined);
    return run;
  };

  const nextRevision = (environment: ViraDeploymentEnvironment): number | undefined => {
    const current = deployments.get(environment);
    const revision = current === null || current === undefined ? 1 : current.revision + 1;
    return Number.isSafeInteger(revision) && revision > 0 && revision <= MAX_SAFE ? revision : undefined;
  };

  const storeVerified = (verified: VerifiedArtifact): ViraApplicationDeploymentResult<ViraApplicationDeploymentArtifactRecord> => {
    const release = verified.record.release;
    const immutableKey = versionKey(release);
    const existingDigest = digestByVersion.get(immutableKey);
    if (existingDigest !== undefined && existingDigest !== verified.record.distributionDigest) {
      return { ok: false, issue: issue("ARTIFACT_CONFLICT", "$.distribution.application.version", "Application id/version is immutable and already points to another digest") };
    }
    const key = artifactKey(release, verified.record.distributionDigest);
    const existing = artifacts.get(key);
    if (existing?.status === "deprecated") {
      return { ok: false, issue: issue("ARTIFACT_DEPRECATED", "$", "deprecated Application release cannot be published again") };
    }
    if (existing !== undefined) return { ok: true, value: existing };
    digestByVersion.set(immutableKey, verified.record.distributionDigest);
    artifacts.set(key, verified.record);
    signedArtifacts.set(key, verified.signed);
    return { ok: true, value: verified.record };
  };

  const deploy = (
    environment: ViraDeploymentEnvironment,
    artifact: ViraApplicationDeploymentArtifactRecord,
    binding: ViraApplicationEnvironmentBinding,
    operation: ViraApplicationDeploymentRecord["operation"],
  ): ViraApplicationDeploymentResult<ViraApplicationDeploymentRecord> => {
    const current = deployments.get(environment) ?? null;
    if (current?.artifactId === artifact.artifactId && current.binding.bindingRef === binding.bindingRef) return { ok: true, value: current };
    const revision = nextRevision(environment);
    if (revision === undefined) return { ok: false, issue: issue("INVALID_PLANE", `$.deployments.${environment}.revision`, "deployment revision overflow") };
    const deployment: ViraApplicationDeploymentRecord = Object.freeze({
      deploymentId: `application-deployment:${environment}:${revision}:${artifact.artifactId}:${binding.bindingRef}`,
      environment,
      revision,
      artifactId: artifact.artifactId,
      release: artifact.release,
      distributionDigest: artifact.distributionDigest,
      binding,
      operation,
      ...(current === null ? {} : { previousDeploymentId: current.deploymentId }),
    });
    deployments.set(environment, deployment);
    history.push(deployment);
    return { ok: true, value: deployment };
  };

  const reverify = async (artifact: ViraApplicationDeploymentArtifactRecord): Promise<ViraApplicationDeploymentResult<VerifiedArtifact>> => {
    const key = artifactKey(artifact.release, artifact.distributionDigest);
    const signed = signedArtifacts.get(key);
    if (signed === undefined) return { ok: false, issue: issue("ARTIFACT_NOT_FOUND", "$", "signed Application release is not registered") };
    return verifyArtifact(signed, trust);
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
        const stored = storeVerified(verified.value);
        if (!stored.ok) return stored;
        return deploy("dev", stored.value, binding.value, "publish");
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
        const key = artifactKey(release.value, promotion.distributionDigest);
        const artifact = artifacts.get(key);
        if (artifact === undefined) return { ok: false, issue: issue("ARTIFACT_NOT_FOUND", "$", "promotion Application release is not registered") };
        if (artifact.status === "deprecated") return { ok: false, issue: issue("ARTIFACT_DEPRECATED", "$", "deprecated Application release cannot be promoted") };
        const source = deployments.get(promotion.from) ?? null;
        if (source === null || source.artifactId !== artifact.artifactId || !exactRelease(source.release, release.value)) {
          return { ok: false, issue: issue("INVALID_PROMOTION", `$.deployments.${promotion.from}`, "source environment does not run the exact requested Application release") };
        }
        const binding = normalizeBinding(promotion.binding, promotion.to);
        if (!binding.ok) return binding;
        const verified = await reverify(artifact);
        if (!verified.ok) return verified;
        return deploy(promotion.to, artifact, binding.value, "promote");
      });
    },
    rollback(inputValue) {
      return enqueue(async () => {
        if (
          !record(inputValue)
          || !exactKeys(inputValue, ["environment", "deploymentId"])
          || !VIRA_DEPLOYMENT_ENVIRONMENTS.includes(inputValue.environment)
          || typeof inputValue.deploymentId !== "string"
        ) {
          return { ok: false, issue: issue("INVALID_ROLLBACK", "$", "rollback input is invalid") };
        }
        const target = history.find((candidate) => candidate.deploymentId === inputValue.deploymentId && candidate.environment === inputValue.environment);
        if (target === undefined) return { ok: false, issue: issue("INVALID_ROLLBACK", "$.deploymentId", "rollback target is not historical state for this environment") };
        const key = artifactKey(target.release, target.distributionDigest);
        const artifact = artifacts.get(key);
        if (artifact === undefined) return { ok: false, issue: issue("ARTIFACT_NOT_FOUND", "$", "rollback Application release is not registered") };
        if (artifact.status === "deprecated") return { ok: false, issue: issue("ARTIFACT_DEPRECATED", "$", "deprecated Application release cannot become a rollback target") };
        const verified = await reverify(artifact);
        if (!verified.ok) return verified;
        return deploy(inputValue.environment, artifact, target.binding, "rollback");
      });
    },
    deprecate(inputValue) {
      return enqueue(async () => {
        if (
          !record(inputValue)
          || !exactKeys(inputValue, ["release", "distributionDigest"])
          || typeof inputValue.distributionDigest !== "string"
          || !DIGEST.test(inputValue.distributionDigest)
        ) {
          return { ok: false, issue: issue("ARTIFACT_NOT_FOUND", "$", "Application release identity is invalid") };
        }
        const release = parseViraApplicationReleaseReference(inputValue.release);
        if (!release.ok) return { ok: false, issue: issue("ARTIFACT_NOT_FOUND", "$.release", release.issue.message) };
        const key = artifactKey(release.value, inputValue.distributionDigest);
        const artifact = artifacts.get(key);
        if (artifact === undefined) return { ok: false, issue: issue("ARTIFACT_NOT_FOUND", "$", "Application release is not registered") };
        if (artifact.status === "deprecated") return { ok: true, value: artifact };
        const deprecated = Object.freeze({ ...artifact, status: "deprecated" as const });
        artifacts.set(key, deprecated);
        return { ok: true, value: deprecated };
      });
    },
    inspect(): ViraApplicationDeploymentInspection {
      return Object.freeze({
        artifacts: Object.freeze([...artifacts.values()]),
        deployments: Object.freeze({
          dev: deployments.get("dev") ?? null,
          staging: deployments.get("staging") ?? null,
          production: deployments.get("production") ?? null,
        }),
        history: Object.freeze([...history]),
      });
    },
    async verifyCachedApplication(artifactInput) {
      const verified = await verifyArtifact(artifactInput, trust);
      if (!verified.ok) return verified;
      const versionDigest = digestByVersion.get(versionKey(verified.value.record.release));
      if (versionDigest !== undefined && versionDigest !== verified.value.record.distributionDigest) {
        return { ok: false, issue: issue("ARTIFACT_CONFLICT", "$.distribution.integrity.digest", "cached Application conflicts with the immutable registered release") };
      }
      const key = artifactKey(verified.value.record.release, verified.value.record.distributionDigest);
      const registered = artifacts.get(key);
      if (registered?.status === "deprecated") return { ok: false, issue: issue("ARTIFACT_DEPRECATED", "$", "deprecated Application release is not accepted for cache verification") };
      return { ok: true, value: registered ?? verified.value.record };
    },
    lookupActive(inputValue): ViraApplicationDeploymentResult<ViraApplicationDeploymentCandidate | null> {
      if (!record(inputValue) || !exactKeys(inputValue, ["release", "environment"]) || !VIRA_DEPLOYMENT_ENVIRONMENTS.includes(inputValue.environment)) {
        return { ok: false, issue: issue("ARTIFACT_NOT_FOUND", "$", "Application lookup input is invalid") };
      }
      const release = parseViraApplicationReleaseReference(inputValue.release);
      if (!release.ok) return { ok: false, issue: issue("ARTIFACT_NOT_FOUND", "$.release", release.issue.message) };
      const deployment = deployments.get(inputValue.environment) ?? null;
      if (deployment === null || !exactRelease(deployment.release, release.value)) return { ok: true, value: null };
      const artifact = artifacts.get(artifactKey(deployment.release, deployment.distributionDigest));
      if (artifact === undefined) return { ok: false, issue: issue("ARTIFACT_NOT_FOUND", "$", "active deployment points to a missing Application release") };
      return { ok: true, value: Object.freeze({ artifact, deployment }) };
    },
  };
  return { ok: true, value: Object.freeze(plane) };
}
