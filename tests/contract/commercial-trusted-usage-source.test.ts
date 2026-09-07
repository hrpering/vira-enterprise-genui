import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  beginViraPostconditionVerification,
  claimViraVerificationWrite,
  completeViraPostconditionVerification,
  createViraDurableActionVerificationRecord,
  markViraVerificationWriteDispatched,
  recordViraVerificationPrecheck,
  type ViraDurableActionVerificationRecord,
} from "../../packages/action-verification/src/durable.js";
import {
  normalizeViraVerifiedActionUsageSource,
  type ViraCommercialTrustedUsageSourceDependencies,
} from "../../packages/commercial-metering/src/trusted-source.js";

const NOW = Date.parse("2026-09-07T12:00:00.000Z");
const scope = Object.freeze({
  version: "1" as const,
  organizationId: "contoso",
  projectId: "refunds",
  environment: "production" as const,
});
const actor = Object.freeze({
  version: "1" as const,
  kind: "user" as const,
  id: "user-1",
  organizationId: "contoso",
});
const entitlementRef = Object.freeze({ id: "entitlement.refund-enterprise", versionRef: "1" });
const meteringRef = Object.freeze({ id: "metering.refund-actions", versionRef: "1" });

const digestProvider = Object.freeze({
  sha256(input: string) {
    return createHash("sha256").update(input).digest("hex");
  },
});

function observation(canonicalDigest: string, observedAtEpochMs: number) {
  return Object.freeze({
    version: "1" as const,
    scope,
    providerId: "github",
    connectionId: "connection.github.refunds",
    resourceType: "repository-file",
    resourceId: "demo/refunds:rules.json",
    observedAtEpochMs,
    providerVersion: Object.freeze({ kind: "blob-sha" as const, value: "a".repeat(40) }),
    canonicalDigest,
    data: Object.freeze({ contentDigest: canonicalDigest }),
  });
}

function verification(
  status: "verified" | "partial" | "mismatch" | "uncertain" = "verified",
  verificationId = "verification.refund.1",
): ViraDurableActionVerificationRecord {
  const created = createViraDurableActionVerificationRecord({
    scope,
    verificationId,
    transactionId: "transaction.refund.1",
    planDigest: "1".repeat(64),
    planRevision: 3,
    operationId: "operation.refund.approve",
    executionId: "execution.refund.1",
    attemptId: "attempt.refund.1",
    providerId: "github",
    connectionId: "connection.github.refunds",
    resourceType: "repository-file",
    resourceId: "demo/refunds:rules.json",
    createdAtEpochMs: NOW,
  });
  if (!created.ok) throw new Error(created.issue.message);
  const prechecked = recordViraVerificationPrecheck({
    record: created.value,
    observation: observation("2".repeat(64), NOW + 1_000),
    precondition: "match",
    nowEpochMs: NOW + 2_000,
  });
  if (!prechecked.ok) throw new Error(prechecked.issue.message);
  const claimed = claimViraVerificationWrite({
    record: prechecked.value,
    workerId: "worker-1",
    expectedRevision: prechecked.value.revision,
    nowEpochMs: NOW + 3_000,
    leaseMs: 60_000,
  });
  if (!claimed.ok) throw new Error(claimed.issue.message);
  const dispatched = markViraVerificationWriteDispatched({
    record: claimed.value,
    workerId: "worker-1",
    leaseEpoch: claimed.value.leaseEpoch,
    expectedRevision: claimed.value.revision,
    nowEpochMs: NOW + 4_000,
  });
  if (!dispatched.ok) throw new Error(dispatched.issue.message);
  const verifying = beginViraPostconditionVerification({
    record: dispatched.value,
    workerId: "worker-1",
    leaseEpoch: dispatched.value.leaseEpoch,
    expectedRevision: dispatched.value.revision,
    nowEpochMs: NOW + 5_000,
  });
  if (!verifying.ok) throw new Error(verifying.issue.message);
  const completed = completeViraPostconditionVerification({
    record: verifying.value,
    workerId: "worker-1",
    leaseEpoch: verifying.value.leaseEpoch,
    expectedRevision: verifying.value.revision,
    nowEpochMs: NOW + 6_000,
    ...(status === "uncertain" ? {} : { observation: observation("3".repeat(64), NOW + 6_000) }),
    status,
  });
  if (!completed.ok) throw new Error(completed.issue.message);
  return completed.value;
}

function authority(record: ViraDurableActionVerificationRecord, overrides: Record<string, unknown> = {}) {
  return {
    version: "1",
    executionId: record.executionId,
    scope,
    transactionId: record.transactionId,
    planDigest: record.planDigest,
    planRevision: record.planRevision,
    operationId: record.operationId,
    grantId: "grant.refund.1",
    grantNonce: "nonce.refund.1",
    frozen: {
      planDigest: record.planDigest,
      planRevision: record.planRevision,
      canonicalPlan: "{}",
      plan: {
        planSchemaVersion: "1",
        canonicalizationVersion: "1",
        transactionId: record.transactionId,
        applicationRef: { id: "demo.refund-app", version: "1.0.0" },
        applicationDigest: "4".repeat(64),
        deploymentId: "deployment.refund.1",
        resolutionDigest: "5".repeat(64),
        actor,
        agent: null,
        workload: null,
        delegation: {},
        scope,
        workContext: { id: "work.refund.1", revision: 1 },
        operations: [{ operationId: record.operationId }],
        policy: { evaluationRefs: [], obligations: {} },
        approvalRequirements: {},
        commercial: {
          entitlementRefs: [entitlementRef],
          meteringRefs: [meteringRef],
          pricingRefs: [{ id: "pricing.refund-actions", versionRef: "1" }],
          settlementRefs: [],
          preflight: {},
        },
        createdAtEpochMs: NOW - 10_000,
        expiresAtEpochMs: NOW + 60_000,
      },
    },
    grant: {},
    ...overrides,
  };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    scope,
    verificationId: "verification.refund.1",
    ...overrides,
  };
}

function dependencies(input: {
  record?: ViraDurableActionVerificationRecord;
  authorityOverride?: Record<string, unknown>;
  binding?: unknown;
  verificationRead?: ViraCommercialTrustedUsageSourceDependencies["verificationSource"]["read"];
  authorityRead?: ViraCommercialTrustedUsageSourceDependencies["authoritySource"]["read"];
  bindingResolve?: ViraCommercialTrustedUsageSourceDependencies["billingBindingSource"]["resolve"];
  digest?: ViraCommercialTrustedUsageSourceDependencies["digestProvider"];
} = {}): ViraCommercialTrustedUsageSourceDependencies {
  const record = input.record ?? verification();
  return Object.freeze({
    verificationSource: Object.freeze({
      read: input.verificationRead ?? (() => record),
    }),
    authoritySource: Object.freeze({
      read: input.authorityRead ?? (() => authority(record, input.authorityOverride)),
    }),
    billingBindingSource: Object.freeze({
      resolve: input.bindingResolve ?? (() => input.binding ?? {
        entitlementRef,
        meteringRef,
        unit: "count",
        locationId: null,
      }),
    }),
    digestProvider: input.digest ?? digestProvider,
  });
}

describe("PROD-14 trusted commercial usage source", () => {
  it("normalizes durable verified Action truth into one deterministic count usage record", async () => {
    const deps = dependencies();
    const first = await normalizeViraVerifiedActionUsageSource(request(), deps);
    const second = await normalizeViraVerifiedActionUsageSource(request(), deps);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.event.sourceKind).toBe("action.effect.verified");
    expect(first.value.event.sourceEventId).toBe(second.value.event.sourceEventId);
    expect(first.value.usage.usageId).toBe(first.value.event.sourceEventId);
    expect(first.value.usage.sourceId).toBe("action.verification");
    expect(first.value.usage.quantity).toBe(1);
    expect(first.value.event.applicationId).toBe("demo.refund-app");
    expect(first.value.event.applicationVersion).toBe("1.0.0");
    expect(first.value.event.applicationDigest).toBe("4".repeat(64));
    expect(first.value.event.authority.afterObservationDigest).toBe("3".repeat(64));
    expect(first.value.event.attribution).toEqual({
      publisherId: null,
      providerId: "github",
      modelId: null,
      nodeId: null,
      platformId: null,
    });
  });

  it.each(["partial", "mismatch", "uncertain"] as const)("rejects durable %s Action truth as billable usage", async (status) => {
    const record = verification(status);
    const result = await normalizeViraVerifiedActionUsageSource(request(), dependencies({ record }));
    expect(result).toMatchObject({ ok: false, issue: { code: "UNVERIFIED_SOURCE" } });
  });

  it("rejects caller-supplied verification, quantity or commercial binding fields", async () => {
    for (const extra of [
      { verification: verification() },
      { quantity: 999 },
      { meteringRef },
      { entitlementRef },
    ]) {
      const result = await normalizeViraVerifiedActionUsageSource(request(extra), dependencies());
      expect(result).toMatchObject({ ok: false, issue: { code: "INVALID_INPUT" } });
    }
  });

  it("rejects verification source identity substitution", async () => {
    const substituted = verification("verified", "verification.attacker.1");
    const result = await normalizeViraVerifiedActionUsageSource(request(), dependencies({ record: substituted }));
    expect(result).toMatchObject({ ok: false, issue: { code: "SOURCE_IDENTITY_MISMATCH" } });
  });

  it("rejects execution authority substitution and undeclared billing bindings", async () => {
    const authorityMismatch = await normalizeViraVerifiedActionUsageSource(
      request(),
      dependencies({ authorityOverride: { executionId: "execution.attacker.1" } }),
    );
    expect(authorityMismatch).toMatchObject({ ok: false, issue: { code: "INVALID_AUTHORITY" } });

    const bindingMismatch = await normalizeViraVerifiedActionUsageSource(
      request(),
      dependencies({
        binding: {
          entitlementRef,
          meteringRef: { id: "metering.attacker", versionRef: "1" },
          unit: "count",
          locationId: null,
        },
      }),
    );
    expect(bindingMismatch).toMatchObject({ ok: false, issue: { code: "INVALID_BINDING" } });
  });

  it("fails closed and sanitizes authority/binding source exceptions", async () => {
    const verificationFailure = await normalizeViraVerifiedActionUsageSource(request(), dependencies({
      verificationRead() { throw new Error("verification-secret-detail"); },
    }));
    expect(verificationFailure).toMatchObject({ ok: false, issue: { code: "SOURCE_READ_FAILED" } });
    if (!verificationFailure.ok) expect(verificationFailure.issue.message).not.toContain("secret-detail");

    const authorityFailure = await normalizeViraVerifiedActionUsageSource(request(), dependencies({
      authorityRead() { throw new Error("authority-secret-detail"); },
    }));
    expect(authorityFailure).toMatchObject({ ok: false, issue: { code: "SOURCE_READ_FAILED" } });

    const bindingFailure = await normalizeViraVerifiedActionUsageSource(request(), dependencies({
      bindingResolve() { throw new Error("binding-secret-detail"); },
    }));
    expect(bindingFailure).toMatchObject({ ok: false, issue: { code: "BINDING_RESOLUTION_FAILED" } });
  });

  it("fails closed on digest-provider failure or invalid digest evidence", async () => {
    const thrown = await normalizeViraVerifiedActionUsageSource(request(), dependencies({
      digest: { sha256() { throw new Error("digest-secret-detail"); } },
    }));
    expect(thrown).toMatchObject({ ok: false, issue: { code: "DIGEST_FAILED" } });

    const invalid = await normalizeViraVerifiedActionUsageSource(request(), dependencies({
      digest: { sha256() { return "not-a-digest"; } },
    }));
    expect(invalid).toMatchObject({ ok: false, issue: { code: "INVALID_DIGEST" } });
  });

  it("does not manufacture publisher/model/node/platform attribution from unrelated authority metadata", async () => {
    const result = await normalizeViraVerifiedActionUsageSource(request(), dependencies({
      authorityOverride: {
        displayPublisher: "attacker-publisher",
        modelId: "attacker-model",
        nodeId: "attacker-node",
        platformId: "attacker-platform",
      },
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.event.attribution).toEqual({
      publisherId: null,
      providerId: "github",
      modelId: null,
      nodeId: null,
      platformId: null,
    });
  });
});
