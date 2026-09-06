import { describe, expect, it } from "vitest";
import type { ViraApplicationEnvironmentBinding } from "../../packages/deployment-plane/src/index.js";
import type { ViraProviderConnection } from "../../packages/provider-connection/src/index.js";
import type { ViraProviderTrustEvidence } from "../../packages/provider-trust/src/index.js";
import { resolveViraActionSupply } from "../../packages/action-supply/src/index.js";

const NOW = 1_900_000_000_000;
const actionRef = Object.freeze({ id: "demo.document.publish", versionRef: "1.0.0" });
const bindingRef = Object.freeze({ id: "demo.binding.document-publish", versionRef: "1.0.0" });
const scope = Object.freeze({
  version: "1" as const,
  organizationId: "org-demo",
  projectId: "project-demo",
  environment: "staging" as const,
});
const secretRef = Object.freeze({
  version: "1" as const,
  organizationId: "org-demo",
  projectId: "project-demo",
  environment: "staging" as const,
  provider: "vault",
  key: "providers.demo",
  versionRef: "7",
});

function connection(overrides: Partial<ViraProviderConnection> = {}): ViraProviderConnection {
  return {
    version: "1",
    id: "demo.connection",
    providerId: "demo",
    connectorId: "demo.connector",
    scope,
    authProfileId: "demo.oauth",
    secretRef,
    grantedScopes: ["documents.write"],
    state: "active",
    expiresAtEpochMs: NOW + 60_000,
    bindings: [
      {
        operationId: "document.publish",
        target: { kind: "action", actionRef },
      },
    ],
    ...overrides,
  };
}

function trustEvidence(overrides: Partial<ViraProviderTrustEvidence> = {}): ViraProviderTrustEvidence {
  return {
    version: "1",
    id: "trust.demo.e001",
    connectionId: "demo.connection",
    providerId: "demo",
    scope,
    credentialRef: secretRef,
    health: {
      status: "healthy",
      checkedAtEpochMs: NOW - 1_000,
    },
    issuedAtEpochMs: NOW - 2_000,
    expiresAtEpochMs: NOW + 30_000,
    revokedAtEpochMs: null,
    ...overrides,
  };
}

function environmentBinding(overrides: Partial<ViraApplicationEnvironmentBinding> = {}): ViraApplicationEnvironmentBinding {
  return {
    version: "1",
    bindingRef: "deployment.binding.demo",
    scope,
    providerIdentityRef: "provider.demo",
    location: "tr-istanbul-1",
    adapterRef: "adapter.demo",
    secretRef,
    trustStatus: "trusted",
    trustEvidenceRef: "trust.demo.e001",
    ...overrides,
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    version: "1",
    bindingRef,
    actionRef,
    connection: connection(),
    trustEvidence: trustEvidence(),
    environmentBinding: environmentBinding(),
    operationId: "document.publish",
    runnerRef: "runner.private",
    behavior: {
      idempotencyStrategy: "provider-native",
      retrySafety: "safe-after-known-no-effect",
      verificationStrategy: "immediate-readback",
      freshnessStrategy: "etag",
      freshnessMaxAgeMs: null,
    },
    nowEpochMs: NOW,
    ...overrides,
  };
}

describe("PROD-10 exact Action supply", () => {
  it("resolves one exact protected Action binding only with live canonical provider trust", () => {
    const result = resolveViraActionSupply(input());
    expect(result).toMatchObject({
      ok: true,
      value: {
        bindingRef,
        actionRef,
        providerId: "demo",
        providerIdentityRef: "provider.demo",
        connectionId: "demo.connection",
        connectorId: "demo.connector",
        operationId: "document.publish",
        adapterRef: "adapter.demo",
        runnerRef: "runner.private",
        trustEvidenceRef: "trust.demo.e001",
        trustValidUntilEpochMs: NOW + 30_000,
        behavior: {
          idempotencyStrategy: "provider-native",
          retrySafety: "safe-after-known-no-effect",
          verificationStrategy: "immediate-readback",
          freshnessStrategy: "etag",
          freshnessMaxAgeMs: null,
        },
      },
    });
    if (!result.ok) throw new Error(result.issue.message);
    expect(result.value.secretRef).toEqual(secretRef);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.secretRef)).toBe(true);
  });

  it("rejects inactive and expired provider connections through the canonical trust evaluator", () => {
    expect(resolveViraActionSupply(input({ connection: connection({ state: "revoked" }) })))
      .toMatchObject({ ok: false, issue: { code: "CONNECTION_NOT_ACTIVE" } });
    expect(resolveViraActionSupply(input({ connection: connection({ expiresAtEpochMs: NOW }) })))
      .toMatchObject({ ok: false, issue: { code: "CONNECTION_EXPIRED" } });
  });

  it("rejects unhealthy, expired and revoked provider trust evidence", () => {
    expect(resolveViraActionSupply(input({
      trustEvidence: trustEvidence({ health: { status: "degraded", checkedAtEpochMs: NOW - 1_000 } }),
    }))).toMatchObject({ ok: false, issue: { code: "PROVIDER_TRUST_REJECTED" } });

    expect(resolveViraActionSupply(input({
      trustEvidence: trustEvidence({ expiresAtEpochMs: NOW }),
    }))).toMatchObject({ ok: false, issue: { code: "PROVIDER_TRUST_REJECTED" } });

    expect(resolveViraActionSupply(input({
      trustEvidence: trustEvidence({ revokedAtEpochMs: NOW - 500 }),
    }))).toMatchObject({ ok: false, issue: { code: "PROVIDER_TRUST_REJECTED" } });
  });

  it("binds the exact trust evidence named by the Application environment binding", () => {
    expect(resolveViraActionSupply(input({
      trustEvidence: trustEvidence({ id: "trust.demo.e002" }),
    }))).toMatchObject({ ok: false, issue: { code: "TRUST_EVIDENCE_MISMATCH" } });

    expect(resolveViraActionSupply(input({
      trustEvidence: trustEvidence({ providerId: "other-provider" }),
    }))).toMatchObject({ ok: false, issue: { code: "PROVIDER_TRUST_REJECTED" } });

    expect(resolveViraActionSupply(input({
      trustEvidence: trustEvidence({ credentialRef: { ...secretRef, key: "providers.other" } }),
    }))).toMatchObject({ ok: false, issue: { code: "PROVIDER_TRUST_REJECTED" } });
  });

  it("rejects floating and mismatched Action references", () => {
    expect(resolveViraActionSupply(input({ actionRef: { id: actionRef.id, versionRef: "latest" } })))
      .toMatchObject({ ok: false, issue: { code: "INVALID_REFERENCE" } });
    expect(resolveViraActionSupply(input({ actionRef: { id: "demo.document.delete", versionRef: "1.0.0" } })))
      .toMatchObject({ ok: false, issue: { code: "ACTION_MISMATCH" } });
  });

  it("rejects query/unbound operations instead of treating them as protected Action supply", () => {
    const queryConnection = connection({
      bindings: [{
        operationId: "document.publish",
        target: { kind: "query", capabilityRef: { id: "demo.capability.document", versionRef: "1.0.0" } },
      }],
    });
    expect(resolveViraActionSupply(input({ connection: queryConnection })))
      .toMatchObject({ ok: false, issue: { code: "ACTION_NOT_BOUND" } });
  });

  it("fails closed on tenant scope and SecretRef drift", () => {
    const otherScope = { ...scope, projectId: "project-other" };
    expect(resolveViraActionSupply(input({ environmentBinding: environmentBinding({ scope: otherScope }) })))
      .toMatchObject({ ok: false, issue: { code: "SCOPE_MISMATCH" } });
    expect(resolveViraActionSupply(input({
      environmentBinding: environmentBinding({ secretRef: { ...secretRef, key: "providers.other" } }),
    }))).toMatchObject({ ok: false, issue: { code: "SECRET_MISMATCH" } });
  });

  it("requires trusted deployment binding", () => {
    expect(resolveViraActionSupply(input({
      environmentBinding: environmentBinding({ trustStatus: "untrusted" }),
    }))).toMatchObject({ ok: false, issue: { code: "UNTRUSTED_ENVIRONMENT_BINDING" } });
  });

  it("rejects unknown fields in untrusted connection and outer snapshots", () => {
    expect(resolveViraActionSupply({ ...input(), unexpected: true }))
      .toMatchObject({ ok: false, issue: { code: "INVALID_INPUT" } });
    expect(resolveViraActionSupply(input({
      connection: { ...connection(), unexpected: true },
    }))).toMatchObject({ ok: false, issue: { code: "INVALID_INPUT" } });
  });

  it("enforces bounded-age freshness semantics deterministically", () => {
    expect(resolveViraActionSupply(input({
      behavior: {
        idempotencyStrategy: "read-before-write",
        retrySafety: "safe-before-effect",
        verificationStrategy: "eventual-readback",
        freshnessStrategy: "bounded-age",
        freshnessMaxAgeMs: 30_000,
      },
    }))).toMatchObject({ ok: true });
    expect(resolveViraActionSupply(input({
      behavior: {
        idempotencyStrategy: "read-before-write",
        retrySafety: "safe-before-effect",
        verificationStrategy: "eventual-readback",
        freshnessStrategy: "bounded-age",
        freshnessMaxAgeMs: null,
      },
    }))).toMatchObject({ ok: false, issue: { code: "INVALID_BEHAVIOR" } });
    expect(resolveViraActionSupply(input({
      behavior: {
        idempotencyStrategy: "read-before-write",
        retrySafety: "safe-before-effect",
        verificationStrategy: "eventual-readback",
        freshnessStrategy: "etag",
        freshnessMaxAgeMs: 1,
      },
    }))).toMatchObject({ ok: false, issue: { code: "INVALID_BEHAVIOR" } });
  });
});
