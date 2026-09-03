import {
  parseExperiencePackManifest,
  serializeExperiencePackManifest,
  type ExperiencePackManifest,
} from "@vira-enterprise-genui/experience-packs";
import {
  VIRA_DEPLOYMENT_ENVIRONMENTS,
  VIRA_DEPLOYMENT_PLANE_VERSION,
  VIRA_DEPLOYMENT_SIGNATURE_ALGORITHMS,
  type ViraArtifactSignature,
  type ViraDeploymentArtifactRecord,
  type ViraDeploymentEnvironment,
  type ViraDeploymentInspection,
  type ViraDeploymentIntegrityProvider,
  type ViraDeploymentIssue,
  type ViraDeploymentIssueCode,
  type ViraDeploymentPlane,
  type ViraDeploymentPlaneCreateResult,
  type ViraDeploymentRecord,
  type ViraDeploymentResult,
  type ViraSignedExperiencePack,
} from "./types.js";

const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const keyIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const signaturePattern = /^[A-Za-z0-9_-]{16,4096}$/;

function issue(code: ViraDeploymentIssueCode, path: string, message: string): ViraDeploymentIssue {
  return Object.freeze({ code, path, message });
}

function validSignature(input: unknown): input is ViraArtifactSignature {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return false;
  const signature = input as Record<string, unknown>;
  const keys = Object.keys(signature);
  return keys.length === 3
    && Object.hasOwn(signature, "algorithm")
    && Object.hasOwn(signature, "keyId")
    && Object.hasOwn(signature, "value")
    && typeof signature.algorithm === "string"
    && VIRA_DEPLOYMENT_SIGNATURE_ALGORITHMS.includes(signature.algorithm as ViraArtifactSignature["algorithm"])
    && typeof signature.keyId === "string"
    && keyIdPattern.test(signature.keyId)
    && typeof signature.value === "string"
    && signaturePattern.test(signature.value);
}

function validIntegrityProvider(input: unknown): input is ViraDeploymentIntegrityProvider {
  return input !== null
    && typeof input === "object"
    && typeof (input as ViraDeploymentIntegrityProvider).digest === "function"
    && typeof (input as ViraDeploymentIntegrityProvider).verifySignature === "function";
}

function artifactKey(packId: string, packVersion: string, manifestDigest: string): string {
  return `${packId}@${packVersion}#${manifestDigest}`;
}

function versionKey(packId: string, packVersion: string): string {
  return `${packId}@${packVersion}`;
}

function artifactId(packId: string, packVersion: string, manifestDigest: string): string {
  return `artifact:${packId}:${packVersion}:${manifestDigest}`;
}

function cloneSignature(signature: ViraArtifactSignature): ViraArtifactSignature {
  return Object.freeze({ algorithm: signature.algorithm, keyId: signature.keyId, value: signature.value });
}

interface VerifiedArtifact {
  readonly signed: ViraSignedExperiencePack;
  readonly manifest: ExperiencePackManifest;
  readonly record: ViraDeploymentArtifactRecord;
}

async function verifyArtifact(
  artifact: ViraSignedExperiencePack,
  integrity: ViraDeploymentIntegrityProvider,
): Promise<ViraDeploymentResult<VerifiedArtifact>> {
  if (artifact === null || typeof artifact !== "object" || artifact.version !== VIRA_DEPLOYMENT_PLANE_VERSION) {
    return { ok: false, issue: issue("INVALID_ARTIFACT", "$", "signed Experience Pack envelope is invalid") };
  }
  if (typeof artifact.manifestDigest !== "string" || !digestPattern.test(artifact.manifestDigest)) {
    return { ok: false, issue: issue("INVALID_ARTIFACT", "$.manifestDigest", "manifestDigest must be a lowercase sha256 digest") };
  }
  if (!validSignature(artifact.signature)) {
    return { ok: false, issue: issue("INVALID_ARTIFACT", "$.signature", "artifact signature envelope is invalid") };
  }
  const parsedManifest = parseExperiencePackManifest(artifact.manifest);
  if (!parsedManifest.ok) {
    return { ok: false, issue: issue("INVALID_ARTIFACT", `$.manifest${parsedManifest.issue.path === "$" ? "" : parsedManifest.issue.path.slice(1)}`, parsedManifest.issue.message) };
  }
  const serialized = serializeExperiencePackManifest(parsedManifest.value);
  if (!serialized.ok) {
    return { ok: false, issue: issue("INVALID_ARTIFACT", "$.manifest", serialized.issue.message) };
  }

  let observedDigest: string;
  try {
    observedDigest = await integrity.digest(serialized.value);
  } catch {
    return { ok: false, issue: issue("DIGEST_MISMATCH", "$.manifestDigest", "integrity provider could not digest canonical Pack manifest") };
  }
  if (observedDigest !== artifact.manifestDigest || !digestPattern.test(observedDigest)) {
    return { ok: false, issue: issue("DIGEST_MISMATCH", "$.manifestDigest", "canonical Pack manifest digest does not match envelope") };
  }

  let signatureValid = false;
  try {
    signatureValid = await integrity.verifySignature({
      manifestDigest: artifact.manifestDigest,
      signature: artifact.signature,
    });
  } catch {
    signatureValid = false;
  }
  if (signatureValid !== true) {
    return { ok: false, issue: issue("SIGNATURE_INVALID", "$.signature", "Pack signature verification failed closed") };
  }

  const manifest = parsedManifest.value;
  const signature = cloneSignature(artifact.signature);
  const normalizedSigned: ViraSignedExperiencePack = Object.freeze({
    version: VIRA_DEPLOYMENT_PLANE_VERSION,
    manifest,
    manifestDigest: artifact.manifestDigest,
    signature,
  });
  const record: ViraDeploymentArtifactRecord = Object.freeze({
    artifactId: artifactId(manifest.id, manifest.version, artifact.manifestDigest),
    packId: manifest.id,
    packVersion: manifest.version,
    manifestDigest: artifact.manifestDigest,
    signature,
    status: "active",
  });
  return { ok: true, value: Object.freeze({ signed: normalizedSigned, manifest, record }) };
}

function adjacentPromotion(from: ViraDeploymentEnvironment, to: ViraDeploymentEnvironment): boolean {
  return (from === "dev" && to === "staging") || (from === "staging" && to === "production");
}

export function createViraDeploymentPlane(input: {
  readonly integrity: ViraDeploymentIntegrityProvider;
}): ViraDeploymentPlaneCreateResult {
  if (input === null || typeof input !== "object" || !validIntegrityProvider(input.integrity)) {
    return { ok: false, issue: issue("INVALID_PLANE", "$", "deployment plane requires an integrity provider") };
  }

  const integrity = input.integrity;
  const artifacts = new Map<string, ViraDeploymentArtifactRecord>();
  const signedArtifacts = new Map<string, ViraSignedExperiencePack>();
  const digestByVersion = new Map<string, string>();
  const deployments = new Map<ViraDeploymentEnvironment, ViraDeploymentRecord | null>([
    ["dev", null],
    ["staging", null],
    ["production", null],
  ]);
  const history: ViraDeploymentRecord[] = [];
  let mutationTail: Promise<void> = Promise.resolve();

  const enqueue = <T>(work: () => Promise<ViraDeploymentResult<T>>): Promise<ViraDeploymentResult<T>> => {
    const run = mutationTail.then(work, work);
    mutationTail = run.then(() => undefined, () => undefined);
    return run;
  };

  const nextRevision = (environment: ViraDeploymentEnvironment): number | undefined => {
    const current = deployments.get(environment);
    const revision = current === null || current === undefined ? 1 : current.revision + 1;
    return Number.isSafeInteger(revision) && revision > 0 && revision <= MAX_SAFE ? revision : undefined;
  };

  const storeVerified = (verified: VerifiedArtifact): ViraDeploymentResult<ViraDeploymentArtifactRecord> => {
    const manifest = verified.manifest;
    const immutableVersionKey = versionKey(manifest.id, manifest.version);
    const existingDigest = digestByVersion.get(immutableVersionKey);
    if (existingDigest !== undefined && existingDigest !== verified.record.manifestDigest) {
      return { ok: false, issue: issue("ARTIFACT_CONFLICT", "$.manifest.version", "Pack id/version is immutable and already points to another digest") };
    }
    const key = artifactKey(manifest.id, manifest.version, verified.record.manifestDigest);
    const existing = artifacts.get(key);
    if (existing?.status === "deprecated") {
      return { ok: false, issue: issue("ARTIFACT_DEPRECATED", "$", "deprecated Pack artifact cannot be published again") };
    }
    if (existing !== undefined) return { ok: true, value: existing };
    digestByVersion.set(immutableVersionKey, verified.record.manifestDigest);
    artifacts.set(key, verified.record);
    signedArtifacts.set(key, verified.signed);
    return { ok: true, value: verified.record };
  };

  const deploy = (
    environment: ViraDeploymentEnvironment,
    record: ViraDeploymentArtifactRecord,
    operation: ViraDeploymentRecord["operation"],
  ): ViraDeploymentResult<ViraDeploymentRecord> => {
    const current = deployments.get(environment) ?? null;
    if (current?.artifactId === record.artifactId) return { ok: true, value: current };
    const revision = nextRevision(environment);
    if (revision === undefined) {
      return { ok: false, issue: issue("INVALID_PLANE", `$.deployments.${environment}.revision`, "deployment revision overflow") };
    }
    const deployment: ViraDeploymentRecord = Object.freeze({
      deploymentId: `deployment:${environment}:${revision}:${record.artifactId}`,
      environment,
      revision,
      artifactId: record.artifactId,
      packId: record.packId,
      packVersion: record.packVersion,
      manifestDigest: record.manifestDigest,
      operation,
      ...(current === null ? {} : { previousDeploymentId: current.deploymentId }),
    });
    deployments.set(environment, deployment);
    history.push(deployment);
    return { ok: true, value: deployment };
  };

  const plane: ViraDeploymentPlane = {
    version: VIRA_DEPLOYMENT_PLANE_VERSION,

    publish(artifact) {
      return enqueue(async () => {
        const verified = await verifyArtifact(artifact, integrity);
        if (!verified.ok) return verified;
        const stored = storeVerified(verified.value);
        if (!stored.ok) return stored;
        return deploy("dev", stored.value, "publish");
      });
    },

    promote(promotion) {
      return enqueue(async () => {
        if (
          promotion === null
          || typeof promotion !== "object"
          || typeof promotion.packId !== "string"
          || typeof promotion.packVersion !== "string"
          || typeof promotion.manifestDigest !== "string"
          || !VIRA_DEPLOYMENT_ENVIRONMENTS.includes(promotion.from)
          || !VIRA_DEPLOYMENT_ENVIRONMENTS.includes(promotion.to)
          || !adjacentPromotion(promotion.from, promotion.to)
        ) {
          return { ok: false, issue: issue("INVALID_PROMOTION", "$", "promotion must move one adjacent environment forward") };
        }
        const key = artifactKey(promotion.packId, promotion.packVersion, promotion.manifestDigest);
        const record = artifacts.get(key);
        const signed = signedArtifacts.get(key);
        if (record === undefined || signed === undefined) return { ok: false, issue: issue("ARTIFACT_NOT_FOUND", "$", "promotion artifact is not registered") };
        if (record.status === "deprecated") return { ok: false, issue: issue("ARTIFACT_DEPRECATED", "$", "deprecated artifact cannot be promoted") };
        const source = deployments.get(promotion.from) ?? null;
        if (
          source === null
          || source.packId !== record.packId
          || source.packVersion !== record.packVersion
          || source.manifestDigest !== record.manifestDigest
        ) {
          return { ok: false, issue: issue("INVALID_PROMOTION", `$.deployments.${promotion.from}`, "source environment does not run the exact requested artifact") };
        }
        const reverified = await verifyArtifact(signed, integrity);
        if (!reverified.ok) return reverified;
        return deploy(promotion.to, record, "promote");
      });
    },

    rollback(input) {
      return enqueue(async () => {
        if (input === null || typeof input !== "object" || !VIRA_DEPLOYMENT_ENVIRONMENTS.includes(input.environment) || typeof input.deploymentId !== "string") {
          return { ok: false, issue: issue("INVALID_ROLLBACK", "$", "rollback input is invalid") };
        }
        const target = history.find((candidate) => candidate.deploymentId === input.deploymentId && candidate.environment === input.environment);
        if (target === undefined) {
          return { ok: false, issue: issue("INVALID_ROLLBACK", "$.deploymentId", "rollback target is not historical state for this environment") };
        }
        const key = artifactKey(target.packId, target.packVersion, target.manifestDigest);
        const record = artifacts.get(key);
        const signed = signedArtifacts.get(key);
        if (record === undefined || signed === undefined) return { ok: false, issue: issue("ARTIFACT_NOT_FOUND", "$", "rollback artifact is no longer registered") };
        if (record.status === "deprecated") return { ok: false, issue: issue("ARTIFACT_DEPRECATED", "$", "deprecated artifact cannot become a rollback target") };
        const reverified = await verifyArtifact(signed, integrity);
        if (!reverified.ok) return reverified;
        return deploy(input.environment, record, "rollback");
      });
    },

    deprecate(input) {
      return enqueue(async () => {
        if (input === null || typeof input !== "object") {
          return { ok: false, issue: issue("ARTIFACT_NOT_FOUND", "$", "artifact identity is invalid") };
        }
        const key = artifactKey(input.packId, input.packVersion, input.manifestDigest);
        const record = artifacts.get(key);
        if (record === undefined) return { ok: false, issue: issue("ARTIFACT_NOT_FOUND", "$", "artifact is not registered") };
        if (record.status === "deprecated") return { ok: true, value: record };
        const deprecated: ViraDeploymentArtifactRecord = Object.freeze({ ...record, status: "deprecated" });
        artifacts.set(key, deprecated);
        return { ok: true, value: deprecated };
      });
    },

    inspect(): ViraDeploymentInspection {
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

    async verifyCachedPack(artifact) {
      const verified = await verifyArtifact(artifact, integrity);
      if (!verified.ok) return verified;
      const key = artifactKey(verified.value.record.packId, verified.value.record.packVersion, verified.value.record.manifestDigest);
      const registered = artifacts.get(key);
      if (registered?.status === "deprecated") {
        return { ok: false, issue: issue("ARTIFACT_DEPRECATED", "$", "deprecated artifact is not accepted for new cache verification") };
      }
      return { ok: true, value: registered ?? verified.value.record };
    },
  };

  return { ok: true, value: Object.freeze(plane) };
}
