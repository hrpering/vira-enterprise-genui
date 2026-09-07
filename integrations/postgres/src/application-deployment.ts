import { parseViraApplicationDistributionEnvelopeV2 } from "../../../packages/application-distribution/src/index.js";
import { parseViraApplicationReleaseReference } from "../../../packages/application-package/src/index.js";
import {
  VIRA_APPLICATION_DEPLOYMENT_ARTIFACT_KIND,
  VIRA_APPLICATION_DEPLOYMENT_VERSION,
  VIRA_APPLICATION_PUBLISHER_PROVENANCE_VERSION,
  VIRA_APPLICATION_ENVIRONMENT_BINDING_VERSION,
  VIRA_DEPLOYMENT_SIGNATURE_ALGORITHMS,
  type ViraApplicationDeploymentArtifactRecord,
  type ViraApplicationDeploymentCommitInput,
  type ViraApplicationDeploymentInspection,
  type ViraApplicationDeploymentIssue,
  type ViraApplicationDeploymentRecord,
  type ViraApplicationDeploymentResult,
  type ViraApplicationDeploymentStateStore,
  type ViraApplicationDeploymentStoreArtifact,
  type ViraApplicationEnvironmentBinding,
  type ViraAuthenticatedPublisherProvenance,
  type ViraArtifactSignature,
  type ViraSignedApplicationDistribution,
} from "../../../packages/deployment-plane/src/index.js";
import {
  createViraEnterpriseContext,
  type ViraEnterpriseScope,
} from "../../../packages/enterprise-context/src/index.js";
import {
  canonicalizeEnterpriseScope,
  withTenantTransaction,
  type PostgresClientLike,
  type PostgresPoolLike,
} from "./transaction.js";

interface ReleaseRow extends Record<string, unknown> {
  readonly publisher_organization_id: unknown;
  readonly publisher_project_id: unknown;
  readonly application_id: unknown;
  readonly application_version: unknown;
  readonly distribution_digest: unknown;
  readonly artifact_id: unknown;
  readonly publisher_id: unknown;
  readonly distribution: unknown;
  readonly provenance: unknown;
  readonly signature: unknown;
  readonly status: unknown;
}

interface DeploymentRow extends Record<string, unknown> {
  readonly organization_id: unknown;
  readonly project_id: unknown;
  readonly environment: unknown;
  readonly application_id: unknown;
  readonly revision: unknown;
  readonly deployment_id: unknown;
  readonly application_version: unknown;
  readonly distribution_digest: unknown;
  readonly artifact_id: unknown;
  readonly binding: unknown;
  readonly operation: unknown;
  readonly previous_deployment_id: unknown;
}

const DIGEST = /^[0-9a-f]{64}$/;
const REF = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/;
const SIGNATURE = /^[A-Za-z0-9_-]{16,4096}$/;

function issue(code: ViraApplicationDeploymentIssue["code"], path: string, message: string): ViraApplicationDeploymentIssue {
  return Object.freeze({ code, path, message });
}

function fail<T>(code: ViraApplicationDeploymentIssue["code"], path: string, message: string): ViraApplicationDeploymentResult<T> {
  return { ok: false, issue: issue(code, path, message) };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactScope(left: ViraEnterpriseScope, right: ViraEnterpriseScope): boolean {
  return left.version === right.version
    && left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function integer(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }
  return undefined;
}

function parseSignature(value: unknown): ViraArtifactSignature | undefined {
  if (!record(value)) return undefined;
  if (
    typeof value.algorithm !== "string"
    || !VIRA_DEPLOYMENT_SIGNATURE_ALGORITHMS.includes(value.algorithm as ViraArtifactSignature["algorithm"])
    || typeof value.keyId !== "string"
    || !REF.test(value.keyId)
    || typeof value.value !== "string"
    || !SIGNATURE.test(value.value)
  ) return undefined;
  return Object.freeze({
    algorithm: value.algorithm as ViraArtifactSignature["algorithm"],
    keyId: value.keyId,
    value: value.value,
  });
}

function parseProvenance(value: unknown): ViraAuthenticatedPublisherProvenance | undefined {
  if (!record(value) || !record(value.principal)) return undefined;
  const principal = value.principal;
  if (
    value.version !== VIRA_APPLICATION_PUBLISHER_PROVENANCE_VERSION
    || typeof value.publisherId !== "string"
    || !REF.test(value.publisherId)
    || principal.version !== "1"
    || (principal.kind !== "user" && principal.kind !== "agent" && principal.kind !== "service")
    || typeof principal.id !== "string"
    || !REF.test(principal.id)
    || typeof principal.organizationId !== "string"
    || !REF.test(principal.organizationId)
    || typeof value.authenticationRef !== "string"
    || !REF.test(value.authenticationRef)
  ) return undefined;
  return Object.freeze({
    version: VIRA_APPLICATION_PUBLISHER_PROVENANCE_VERSION,
    publisherId: value.publisherId,
    principal: Object.freeze({
      version: "1",
      kind: principal.kind,
      id: principal.id,
      organizationId: principal.organizationId,
    }),
    authenticationRef: value.authenticationRef,
  });
}

function parseBinding(value: unknown, expectedScope: ViraEnterpriseScope): ViraApplicationEnvironmentBinding | undefined {
  if (!record(value) || !record(value.scope) || !record(value.secretRef)) return undefined;
  if (
    value.version !== VIRA_APPLICATION_ENVIRONMENT_BINDING_VERSION
    || typeof value.bindingRef !== "string" || !REF.test(value.bindingRef)
    || typeof value.providerIdentityRef !== "string" || !REF.test(value.providerIdentityRef)
    || typeof value.location !== "string" || value.location.length < 1 || value.location.length > 256
    || typeof value.adapterRef !== "string" || !REF.test(value.adapterRef)
    || value.trustStatus !== "trusted"
    || typeof value.trustEvidenceRef !== "string" || !REF.test(value.trustEvidenceRef)
  ) return undefined;
  const scopeInput = value.scope as unknown as ViraEnterpriseScope;
  const context = createViraEnterpriseContext({
    organizationId: scopeInput.organizationId,
    projectId: scopeInput.projectId,
    environments: [scopeInput.environment],
  });
  if (!context.ok) return undefined;
  const scope = context.value.scope(scopeInput.environment);
  if (!scope.ok || !exactScope(scope.value, scopeInput) || !exactScope(scope.value, expectedScope)) return undefined;
  const secret = context.value.secretRef(value.secretRef);
  if (!secret.ok) return undefined;
  return Object.freeze({
    version: VIRA_APPLICATION_ENVIRONMENT_BINDING_VERSION,
    bindingRef: value.bindingRef,
    scope: scope.value,
    providerIdentityRef: value.providerIdentityRef,
    location: value.location,
    adapterRef: value.adapterRef,
    secretRef: secret.value,
    trustStatus: "trusted",
    trustEvidenceRef: value.trustEvidenceRef,
  });
}

function mapRelease(row: ReleaseRow): ViraApplicationDeploymentResult<{
  readonly value: ViraApplicationDeploymentStoreArtifact;
  readonly publisherOrganizationId: string;
  readonly publisherProjectId: string;
}> {
  if (
    typeof row.publisher_organization_id !== "string"
    || typeof row.publisher_project_id !== "string"
    || typeof row.application_id !== "string"
    || typeof row.application_version !== "string"
    || typeof row.distribution_digest !== "string"
    || !DIGEST.test(row.distribution_digest)
    || typeof row.artifact_id !== "string"
    || typeof row.publisher_id !== "string"
    || (row.status !== "active" && row.status !== "deprecated")
  ) return fail("PERSISTENCE_FAILED", "$row", "persisted Application release row is invalid");

  const release = parseViraApplicationReleaseReference({ id: row.application_id, version: row.application_version });
  const distribution = parseViraApplicationDistributionEnvelopeV2(row.distribution);
  const provenance = parseProvenance(row.provenance);
  const signature = parseSignature(row.signature);
  if (!release.ok || !distribution.ok || provenance === undefined || signature === undefined) {
    return fail("PERSISTENCE_FAILED", "$row", "persisted Application release payload is invalid");
  }
  if (
    distribution.value.application.identity.id !== release.value.id
    || distribution.value.application.version !== release.value.version
    || distribution.value.integrity.digest !== row.distribution_digest
    || distribution.value.application.publisher.id !== row.publisher_id
    || provenance.publisherId !== row.publisher_id
    || provenance.principal.organizationId !== row.publisher_organization_id
  ) return fail("ARTIFACT_CONFLICT", "$row", "persisted Application release identity is internally inconsistent");

  const artifact: ViraApplicationDeploymentArtifactRecord = Object.freeze({
    artifactId: row.artifact_id,
    artifactKind: VIRA_APPLICATION_DEPLOYMENT_ARTIFACT_KIND,
    release: release.value,
    distributionDigest: row.distribution_digest,
    publisherId: row.publisher_id,
    distribution: distribution.value,
    provenance,
    signature,
    status: row.status,
  });
  const signed: ViraSignedApplicationDistribution = Object.freeze({
    version: VIRA_APPLICATION_DEPLOYMENT_VERSION,
    artifactKind: VIRA_APPLICATION_DEPLOYMENT_ARTIFACT_KIND,
    distribution: distribution.value,
    provenance,
    signature,
  });
  return {
    ok: true,
    value: Object.freeze({
      value: Object.freeze({ artifact, signed }),
      publisherOrganizationId: row.publisher_organization_id,
      publisherProjectId: row.publisher_project_id,
    }),
  };
}

function mapDeployment(row: DeploymentRow, scope: ViraEnterpriseScope): ViraApplicationDeploymentResult<ViraApplicationDeploymentRecord> {
  const revision = integer(row.revision);
  if (
    row.organization_id !== scope.organizationId
    || row.project_id !== scope.projectId
    || row.environment !== scope.environment
    || typeof row.application_id !== "string"
    || revision === undefined || revision < 1
    || typeof row.deployment_id !== "string"
    || typeof row.application_version !== "string"
    || typeof row.distribution_digest !== "string" || !DIGEST.test(row.distribution_digest)
    || typeof row.artifact_id !== "string"
    || (row.operation !== "publish" && row.operation !== "promote" && row.operation !== "rollback")
    || (row.previous_deployment_id !== null && row.previous_deployment_id !== undefined && typeof row.previous_deployment_id !== "string")
  ) return fail("PERSISTENCE_FAILED", "$row", "persisted Application deployment row is invalid");
  const release = parseViraApplicationReleaseReference({ id: row.application_id, version: row.application_version });
  const binding = parseBinding(row.binding, scope);
  if (!release.ok || binding === undefined) return fail("PERSISTENCE_FAILED", "$row", "persisted Application deployment payload is invalid");
  return {
    ok: true,
    value: Object.freeze({
      deploymentId: row.deployment_id,
      environment: scope.environment,
      revision,
      artifactId: row.artifact_id,
      release: release.value,
      distributionDigest: row.distribution_digest,
      binding,
      operation: row.operation,
      ...(typeof row.previous_deployment_id === "string" ? { previousDeploymentId: row.previous_deployment_id } : {}),
    }),
  };
}

const releaseSelect = `SELECT
  publisher_organization_id,
  publisher_project_id,
  application_id,
  application_version,
  distribution_digest::text AS distribution_digest,
  artifact_id,
  publisher_id,
  distribution,
  provenance,
  signature,
  status
FROM vira.application_release`;

const deploymentSelect = `SELECT
  organization_id,
  project_id,
  environment,
  application_id,
  revision::text AS revision,
  deployment_id,
  application_version,
  distribution_digest::text AS distribution_digest,
  artifact_id,
  binding,
  operation,
  previous_deployment_id
FROM vira.application_deployment`;

function sameSigned(left: ViraApplicationDeploymentStoreArtifact, right: ViraApplicationDeploymentStoreArtifact): boolean {
  return left.artifact.artifactId === right.artifact.artifactId
    && left.artifact.distributionDigest === right.artifact.distributionDigest
    && left.artifact.publisherId === right.artifact.publisherId
    && left.signed.provenance.publisherId === right.signed.provenance.publisherId
    && left.signed.provenance.authenticationRef === right.signed.provenance.authenticationRef
    && left.signed.provenance.principal.kind === right.signed.provenance.principal.kind
    && left.signed.provenance.principal.id === right.signed.provenance.principal.id
    && left.signed.provenance.principal.organizationId === right.signed.provenance.principal.organizationId
    && left.signed.signature.algorithm === right.signed.signature.algorithm
    && left.signed.signature.keyId === right.signed.signature.keyId
    && left.signed.signature.value === right.signed.signature.value;
}

async function currentDeployment(client: PostgresClientLike, scope: ViraEnterpriseScope, applicationId: string): Promise<ViraApplicationDeploymentResult<ViraApplicationDeploymentRecord | null>> {
  const result = await client.query<DeploymentRow>(
    `${deploymentSelect}
     WHERE deployment_id = (
       SELECT deployment_id FROM vira.application_activation
       WHERE organization_id = $1 AND project_id = $2 AND environment = $3 AND application_id = $4
     )
     LIMIT 2`,
    [scope.organizationId, scope.projectId, scope.environment, applicationId],
  );
  if (result.rows.length === 0) return { ok: true, value: null };
  if (result.rows.length !== 1) return fail("PERSISTENCE_FAILED", "$row", "Application activation is not unique");
  return mapDeployment(result.rows[0]!, scope);
}

export function createPostgresApplicationDeploymentStateStore(pool: PostgresPoolLike): ViraApplicationDeploymentStateStore {
  if (pool === null || typeof pool !== "object" || typeof pool.connect !== "function") {
    throw new TypeError("PostgreSQL Application deployment store requires a pool");
  }

  return Object.freeze<ViraApplicationDeploymentStateStore>({
    async registerArtifact(input): Promise<ViraApplicationDeploymentResult<ViraApplicationDeploymentArtifactRecord>> {
      try {
        return await withTenantTransaction(pool, input.scope, async (client, scope) => {
          if (input.artifact.provenance.principal.organizationId !== scope.organizationId) {
            return fail("PUBLISHER_MISMATCH", "$.scope.organizationId", "authenticated publisher organization does not own this deployment scope");
          }
          const expected: ViraApplicationDeploymentStoreArtifact = Object.freeze({ artifact: input.artifact, signed: input.signed });
          await client.query(
            `INSERT INTO vira.application_release (
               publisher_organization_id, publisher_project_id, application_id, application_version,
               distribution_digest, artifact_id, publisher_id, distribution, provenance, signature, status
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11)
             ON CONFLICT (application_id, application_version) DO NOTHING`,
            [
              scope.organizationId,
              scope.projectId,
              input.artifact.release.id,
              input.artifact.release.version,
              input.artifact.distributionDigest,
              input.artifact.artifactId,
              input.artifact.publisherId,
              JSON.stringify(input.artifact.distribution),
              JSON.stringify(input.artifact.provenance),
              JSON.stringify(input.artifact.signature),
              input.artifact.status,
            ],
          );
          const selected = await client.query<ReleaseRow>(
            `${releaseSelect} WHERE application_id = $1 AND application_version = $2 LIMIT 2`,
            [input.artifact.release.id, input.artifact.release.version],
          );
          if (selected.rows.length !== 1) {
            return fail("ARTIFACT_CONFLICT", "$.release", "Application release identity is owned by another organization or is not readable");
          }
          const mapped = mapRelease(selected.rows[0]!);
          if (!mapped.ok) return mapped;
          if (!sameSigned(mapped.value.value, expected)) {
            return fail("ARTIFACT_CONFLICT", "$.release", "Application id/version is immutable and already has another authenticated artifact");
          }
          if (mapped.value.value.artifact.status === "deprecated") {
            return fail("ARTIFACT_DEPRECATED", "$.release", "deprecated Application release cannot be registered again");
          }
          return { ok: true, value: mapped.value.value.artifact };
        });
      } catch {
        return fail("PERSISTENCE_FAILED", "$store", "Application release persistence failed closed");
      }
    },

    async getArtifact(input): Promise<ViraApplicationDeploymentResult<ViraApplicationDeploymentStoreArtifact | null>> {
      try {
        return await withTenantTransaction(pool, input.scope, async (client) => {
          const selected = await client.query<ReleaseRow>(
            `${releaseSelect} WHERE application_id = $1 AND application_version = $2 LIMIT 2`,
            [input.release.id, input.release.version],
          );
          if (selected.rows.length === 0) return { ok: true, value: null };
          if (selected.rows.length !== 1) return fail("PERSISTENCE_FAILED", "$row", "Application release lookup is not unique");
          const mapped = mapRelease(selected.rows[0]!);
          return mapped.ok ? { ok: true, value: mapped.value.value } : mapped;
        });
      } catch {
        return fail("PERSISTENCE_FAILED", "$store", "Application release lookup failed closed");
      }
    },

    async setArtifactStatus(input): Promise<ViraApplicationDeploymentResult<ViraApplicationDeploymentArtifactRecord>> {
      try {
        return await withTenantTransaction(pool, input.scope, async (client) => {
          const updated = await client.query<ReleaseRow>(
            `UPDATE vira.application_release
             SET status = $1, updated_at = clock_timestamp()
             WHERE application_id = $2 AND application_version = $3 AND distribution_digest = $4
             RETURNING publisher_organization_id, publisher_project_id, application_id, application_version,
               distribution_digest::text AS distribution_digest, artifact_id, publisher_id, distribution, provenance, signature, status`,
            [input.status, input.release.id, input.release.version, input.distributionDigest],
          );
          if (updated.rows.length !== 1) return fail("ARTIFACT_NOT_FOUND", "$.release", "Application release is not owned by this publisher project");
          const mapped = mapRelease(updated.rows[0]!);
          return mapped.ok ? { ok: true, value: mapped.value.value.artifact } : mapped;
        });
      } catch {
        return fail("PERSISTENCE_FAILED", "$store", "Application release status update failed closed");
      }
    },

    async getActive(input): Promise<ViraApplicationDeploymentResult<ViraApplicationDeploymentRecord | null>> {
      try {
        return await withTenantTransaction(pool, input.scope, async (client, scope) => currentDeployment(client, scope, input.applicationId));
      } catch {
        return fail("PERSISTENCE_FAILED", "$store", "Application activation lookup failed closed");
      }
    },

    async getHistorical(input): Promise<ViraApplicationDeploymentResult<ViraApplicationDeploymentRecord | null>> {
      try {
        return await withTenantTransaction(pool, input.scope, async (client, scope) => {
          const selected = await client.query<DeploymentRow>(
            `${deploymentSelect} WHERE deployment_id = $1 LIMIT 2`,
            [input.deploymentId],
          );
          if (selected.rows.length === 0) return { ok: true, value: null };
          if (selected.rows.length !== 1) return fail("PERSISTENCE_FAILED", "$row", "Application deployment history lookup is not unique");
          return mapDeployment(selected.rows[0]!, scope);
        });
      } catch {
        return fail("PERSISTENCE_FAILED", "$store", "Application deployment history lookup failed closed");
      }
    },

    async commitDeployment(input: ViraApplicationDeploymentCommitInput): Promise<ViraApplicationDeploymentResult<ViraApplicationDeploymentRecord>> {
      const targetScope = input.deployment.binding.scope;
      try {
        return await withTenantTransaction(pool, targetScope, async (client, scope) => {
          const applicationId = input.deployment.release.id;
          await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
            `${scope.organizationId}\u0000${scope.projectId}\u0000${applicationId}`,
          ]);

          if (input.requiredSource !== undefined) {
            if (
              input.requiredSource.scope.organizationId !== scope.organizationId
              || input.requiredSource.scope.projectId !== scope.projectId
              || input.requiredSource.applicationId !== applicationId
            ) return fail("DEPLOYMENT_CONFLICT", "$.requiredSource", "promotion source must stay inside the same tenant project lineage");
            await client.query("SELECT set_config('vira.environment', $1, true)", [input.requiredSource.scope.environment]);
            await client.query("SELECT vira.require_scope()");
            const source = await currentDeployment(client, input.requiredSource.scope, input.requiredSource.applicationId);
            await client.query("SELECT set_config('vira.environment', $1, true)", [scope.environment]);
            await client.query("SELECT vira.require_scope()");
            if (!source.ok) return source;
            if (source.value?.deploymentId !== input.requiredSource.deploymentId) {
              return fail("DEPLOYMENT_CONFLICT", "$.requiredSource", "promotion source changed concurrently");
            }
          }

          const release = await client.query<ReleaseRow>(
            `${releaseSelect} WHERE application_id = $1 AND application_version = $2 LIMIT 2 FOR UPDATE`,
            [input.deployment.release.id, input.deployment.release.version],
          );
          if (release.rows.length !== 1) return fail("ARTIFACT_NOT_FOUND", "$.release", "deployment release is not registered for this organization");
          const mappedRelease = mapRelease(release.rows[0]!);
          if (!mappedRelease.ok) return mappedRelease;
          if (
            mappedRelease.value.value.artifact.status === "deprecated"
            || mappedRelease.value.value.artifact.artifactId !== input.deployment.artifactId
            || mappedRelease.value.value.artifact.distributionDigest !== input.deployment.distributionDigest
            || mappedRelease.value.publisherOrganizationId !== scope.organizationId
          ) {
            if (mappedRelease.value.value.artifact.status === "deprecated") {
              return fail("ARTIFACT_DEPRECATED", "$.release", "deprecated Application release cannot be activated");
            }
            return fail("ARTIFACT_CONFLICT", "$.release", "deployment does not match the immutable Application release");
          }

          const activation = await client.query<Record<string, unknown>>(
            `SELECT deployment_id, revision::text AS revision
             FROM vira.application_activation
             WHERE organization_id = $1 AND project_id = $2 AND environment = $3 AND application_id = $4
             FOR UPDATE`,
            [scope.organizationId, scope.projectId, scope.environment, applicationId],
          );
          if (activation.rows.length > 1) return fail("PERSISTENCE_FAILED", "$row", "Application activation is not unique");
          const currentId = activation.rows.length === 0 ? null : activation.rows[0]?.deployment_id;
          const currentRevision = activation.rows.length === 0 ? 0 : integer(activation.rows[0]?.revision);
          if ((currentId !== null && typeof currentId !== "string") || currentRevision === undefined) {
            return fail("PERSISTENCE_FAILED", "$row", "Application activation row is invalid");
          }
          if (currentId !== input.expectedPreviousDeploymentId) {
            return fail("DEPLOYMENT_CONFLICT", "$.expectedPreviousDeploymentId", "active Application deployment changed concurrently");
          }
          if (input.deployment.revision !== currentRevision + 1) {
            return fail("DEPLOYMENT_CONFLICT", "$.revision", "deployment revision does not extend current persistent activation");
          }
          if (input.deployment.previousDeploymentId !== (currentId ?? undefined)) {
            return fail("DEPLOYMENT_CONFLICT", "$.previousDeploymentId", "deployment previous pointer does not match current persistent activation");
          }

          await client.query(
            `INSERT INTO vira.application_deployment (
               organization_id, project_id, environment, application_id, revision, deployment_id,
               application_version, distribution_digest, artifact_id, publisher_organization_id,
               binding, operation, previous_deployment_id
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)`,
            [
              scope.organizationId,
              scope.projectId,
              scope.environment,
              applicationId,
              input.deployment.revision,
              input.deployment.deploymentId,
              input.deployment.release.version,
              input.deployment.distributionDigest,
              input.deployment.artifactId,
              scope.organizationId,
              JSON.stringify(input.deployment.binding),
              input.deployment.operation,
              input.deployment.previousDeploymentId ?? null,
            ],
          );
          await client.query(
            `INSERT INTO vira.application_activation (
               organization_id, project_id, environment, application_id, deployment_id, revision,
               application_version, distribution_digest, artifact_id
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (organization_id, project_id, environment, application_id)
             DO UPDATE SET deployment_id = EXCLUDED.deployment_id,
               revision = EXCLUDED.revision,
               application_version = EXCLUDED.application_version,
               distribution_digest = EXCLUDED.distribution_digest,
               artifact_id = EXCLUDED.artifact_id,
               updated_at = clock_timestamp()`,
            [
              scope.organizationId,
              scope.projectId,
              scope.environment,
              applicationId,
              input.deployment.deploymentId,
              input.deployment.revision,
              input.deployment.release.version,
              input.deployment.distributionDigest,
              input.deployment.artifactId,
            ],
          );
          return { ok: true, value: input.deployment };
        });
      } catch {
        return fail("PERSISTENCE_FAILED", "$store", "Application deployment commit failed closed");
      }
    },

    async inspect(scopeInput): Promise<ViraApplicationDeploymentResult<ViraApplicationDeploymentInspection>> {
      let scope: ViraEnterpriseScope;
      try {
        scope = canonicalizeEnterpriseScope(scopeInput);
      } catch {
        return fail("INVALID_BINDING", "$.scope", "Application deployment inspection scope is invalid");
      }
      try {
        return await withTenantTransaction(pool, scope, async (client, canonicalScope) => {
          const releaseRows = await client.query<ReleaseRow>(`${releaseSelect} ORDER BY application_id, application_version`);
          const artifacts: ViraApplicationDeploymentArtifactRecord[] = [];
          for (const row of releaseRows.rows) {
            const mapped = mapRelease(row);
            if (!mapped.ok) return mapped;
            artifacts.push(mapped.value.value.artifact);
          }
          const historyRows = await client.query<DeploymentRow>(
            `${deploymentSelect} WHERE organization_id = $1 AND project_id = $2 AND environment = $3 ORDER BY application_id, revision`,
            [canonicalScope.organizationId, canonicalScope.projectId, canonicalScope.environment],
          );
          const history: ViraApplicationDeploymentRecord[] = [];
          for (const row of historyRows.rows) {
            const mapped = mapDeployment(row, canonicalScope);
            if (!mapped.ok) return mapped;
            history.push(mapped.value);
          }
          const currentRows = await client.query<DeploymentRow>(
            `${deploymentSelect} WHERE deployment_id IN (
               SELECT deployment_id FROM vira.application_activation
               WHERE organization_id = $1 AND project_id = $2 AND environment = $3
             ) ORDER BY application_id`,
            [canonicalScope.organizationId, canonicalScope.projectId, canonicalScope.environment],
          );
          const deployments: ViraApplicationDeploymentRecord[] = [];
          for (const row of currentRows.rows) {
            const mapped = mapDeployment(row, canonicalScope);
            if (!mapped.ok) return mapped;
            deployments.push(mapped.value);
          }
          return {
            ok: true,
            value: Object.freeze({
              artifacts: Object.freeze(artifacts),
              deployments: Object.freeze(deployments),
              history: Object.freeze(history),
            }),
          };
        });
      } catch {
        return fail("PERSISTENCE_FAILED", "$store", "Application deployment inspection failed closed");
      }
    },
  });
}
