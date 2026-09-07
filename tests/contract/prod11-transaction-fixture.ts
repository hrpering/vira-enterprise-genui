import { createHash } from "node:crypto";
import type {
  ViraFrozenTransactionPlan,
  ViraTransactionApprovalEvidence,
  ViraTransactionComprehension,
  ViraTransactionGrantReplayGuard,
  ViraTransactionGrantSigner,
  ViraTransactionGrantVerifier,
} from "../../packages/action-transaction/src/index.js";

export const NOW = 1_900_000_000_000;
export const scope = Object.freeze({
  version: "1" as const,
  organizationId: "org-demo",
  projectId: "project-demo",
  environment: "staging" as const,
});
export const user = Object.freeze({
  version: "1" as const,
  kind: "user" as const,
  id: "user:alice",
  organizationId: "org-demo",
});

export interface FrozenPlanOverrides {
  readonly planDigest?: string;
  readonly planRevision?: number;
  readonly actionVersion?: string;
  readonly resourceId?: string;
  readonly amount?: number;
}

export function frozenPlan(overrides: FrozenPlanOverrides = {}): ViraFrozenTransactionPlan {
  const planDigest = overrides.planDigest ?? "a".repeat(64);
  const amount = overrides.amount ?? 1200;
  const plan = {
    planSchemaVersion: "1" as const,
    canonicalizationVersion: "1" as const,
    transactionId: "transaction.demo.publish",
    applicationRef: { id: "demo.application", version: "1.0.0" },
    applicationDigest: "b".repeat(64),
    deploymentId: "deployment:demo:staging:42",
    resolutionDigest: "c".repeat(64),
    actor: user,
    agent: null,
    workload: null,
    delegation: {
      principal: user,
      scope,
      audience: "vira.action-transaction",
      grantIds: Object.freeze([]),
    },
    scope,
    workContext: { id: "work.demo.42", revision: 3 },
    operations: Object.freeze([{
      operationId: "publish.document",
      actionRef: { id: "demo.document.publish", versionRef: overrides.actionVersion ?? "1.0.0" },
      actionIntent: { resource: { id: overrides.resourceId ?? "doc-42" }, amount },
      actionBindingRef: { id: "demo.binding.document-publish", versionRef: "1.0.0" },
      providerId: "demo",
      providerIdentityRef: "provider.demo",
      connectionId: "demo.connection",
      connectorId: "demo.connector",
      providerOperationId: "document.publish",
      adapterRef: "adapter.demo",
      runnerRef: "runner.private",
      secretRef: {
        version: "1" as const,
        organizationId: "org-demo",
        projectId: "project-demo",
        environment: "staging" as const,
        provider: "vault",
        key: "providers.demo",
        versionRef: "7",
      },
      trustEvidenceRef: "trust.demo.e001",
      trustValidUntilEpochMs: NOW + 600_000,
      resourceType: "document",
      resourceId: overrides.resourceId ?? "doc-42",
      observedBefore: { ref: "artifact.before.doc-42", digest: "d".repeat(64), etag: "etag-42" },
      preconditions: Object.freeze([{ kind: "etag-equals", value: "etag-42" }]),
      expectedPostconditions: Object.freeze([{ kind: "visibility-equals", value: "internal" }]),
      risk: "medium" as const,
      reversibility: "reversible" as const,
      dependsOn: Object.freeze([]),
      idempotencyKey: "tx-demo:publish.document",
      idempotencyStrategy: "provider-native" as const,
      retrySafety: "safe-after-known-no-effect" as const,
      verificationStrategy: "immediate-readback" as const,
      freshnessStrategy: "etag" as const,
      freshnessMaxAgeMs: null,
    }]),
    policy: {
      evaluationRefs: Object.freeze(["policy.eval.demo.42"]),
      obligations: { confirmation: "required", reason: "external-write" },
    },
    approvalRequirements: { kind: "human", minimum: 1 },
    commercial: {
      entitlementRefs: Object.freeze([{ id: "demo.entitlement.standard", versionRef: "1.0.0" }]),
      meteringRefs: Object.freeze([{ id: "demo.meter.write", versionRef: "1.0.0" }]),
      pricingRefs: Object.freeze([{ id: "demo.price.write", versionRef: "1.0.0" }]),
      settlementRefs: Object.freeze([{ id: "demo.settlement.default", versionRef: "1.0.0" }]),
      preflight: { entitled: true, estimatedCostNanos: amount },
    },
    createdAtEpochMs: NOW - 1_000,
    expiresAtEpochMs: NOW + 300_000,
  };
  return Object.freeze({
    plan: Object.freeze(plan),
    planRevision: overrides.planRevision ?? 7,
    canonicalPlan: "{frozen-plan}",
    planDigest,
  });
}

export function deterministicSignature(message: string, keyId = "kms-key-1"): string {
  const first = createHash("sha256").update(`${keyId}\u0000${message}`).digest("base64url");
  return `${first}${first}`;
}

export function signer(keyId = "kms-key-1"): ViraTransactionGrantSigner {
  return {
    sign({ message }) {
      return { keyId, signature: deterministicSignature(message, keyId) };
    },
  };
}

export function verifier(expectedKeyId = "kms-key-1"): ViraTransactionGrantVerifier {
  return {
    verify({ message, keyId, signature }) {
      return keyId === expectedKeyId && signature === deterministicSignature(message, keyId);
    },
  };
}

export function replayGuard(): ViraTransactionGrantReplayGuard & { seen: Set<string> } {
  const seen = new Set<string>();
  return {
    seen,
    accept({ scope: itemScope, nonce }) {
      const key = `${itemScope.organizationId}/${itemScope.projectId}/${itemScope.environment}/${nonce}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    },
  };
}

export function approvedEvidence(review: ViraTransactionComprehension): ViraTransactionApprovalEvidence {
  return Object.freeze({
    version: "1",
    approvalId: "approval.demo.001",
    scope,
    transactionId: review.transactionId,
    planDigest: review.planDigest,
    planRevision: review.planRevision,
    issuer: user,
    decision: "approved",
    issuedAtEpochMs: NOW,
    expiresAtEpochMs: NOW + 120_000,
  });
}
