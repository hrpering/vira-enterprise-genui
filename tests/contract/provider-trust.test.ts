import { describe, expect, it } from "vitest";
import { createConnectorKitContract } from "../../packages/adapter-sdk/src/index.js";
import { createProviderConnection, transitionProviderConnection, type ViraProviderConnection } from "../../packages/provider-connection/src/index.js";
import { evaluateViraProviderTrust, parseViraProviderTrustEvidence } from "../../packages/provider-trust/src/index.js";

const NOW = 1_900_000_000_000;
const CONNECTION_EXPIRY = 2_000_000_000_000;
const connectorResult = createConnectorKitContract({
  version: "1",
  id: "demo.connector",
  providerId: "demo",
  source: { kind: "rest", reference: "https://api.example.com" },
  authProfiles: [{ id: "demo.auth", kind: "api-key", scopes: ["items:read"] }],
  operations: [{
    id: "demo.item.get",
    providerEffect: "read",
    classification: "query",
    authProfileId: "demo.auth",
    requiredScopes: ["items:read"],
    method: "GET",
    path: "/items/{id}",
    resourceType: "demo.item",
    inputSchemaRef: "demo.schema.item.query",
    outputSchemaRef: "demo.schema.item",
    pagination: "none",
    rateLimit: "provider-headers",
    completion: "inline",
    idempotency: "none",
    retry: "query-safe",
    verification: "response",
    errorNormalization: "canonical",
  }],
  sandbox: { testOperationId: "demo.item.get" },
});
if (!connectorResult.ok) throw new Error(connectorResult.issue.message);

function pendingConnection() {
  const created = createProviderConnection({
    version: "1",
    id: "demo.connection",
    providerId: "demo",
    connectorId: "demo.connector",
    scope: { version: "1", organizationId: "org-demo", projectId: "project-demo", environment: "staging" },
    authProfileId: "demo.auth",
    secretRef: {
      version: "1",
      organizationId: "org-demo",
      projectId: "project-demo",
      environment: "staging",
      provider: "aws.secrets",
      key: "providers/demo",
      versionRef: "cred-7",
    },
    grantedScopes: ["items:read"],
    state: "pending",
    expiresAtEpochMs: CONNECTION_EXPIRY,
    bindings: [{
      operationId: "demo.item.get",
      target: { kind: "query", capabilityRef: { id: "demo.capability.item.get", versionRef: "1.0.0" } },
    }],
  }, connectorResult.value);
  if (!created.ok) throw new Error(created.issue.message);
  return created.value;
}

function activeConnection(): ViraProviderConnection {
  const activated = transitionProviderConnection(pendingConnection(), "activate", NOW);
  if (!activated.ok) throw new Error(activated.issue.message);
  return activated.value;
}

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    version: "1",
    id: "trust.demo.connection.001",
    connectionId: "demo.connection",
    providerId: "demo",
    scope: { version: "1", organizationId: "org-demo", projectId: "project-demo", environment: "staging" },
    credentialRef: {
      version: "1",
      organizationId: "org-demo",
      projectId: "project-demo",
      environment: "staging",
      provider: "aws.secrets",
      key: "providers/demo",
      versionRef: "cred-7",
    },
    health: { status: "healthy", checkedAtEpochMs: NOW - 1_000 },
    issuedAtEpochMs: NOW - 10_000,
    expiresAtEpochMs: NOW + 100_000,
    revokedAtEpochMs: null,
    ...overrides,
  };
}

describe("PROD-09 provider trust", () => {
  it("trusts only exact healthy evidence for an active canonical connection", () => {
    const result = evaluateViraProviderTrust({ connection: activeConnection(), evidence: evidence(), nowEpochMs: NOW });
    expect(result).toMatchObject({
      ok: true,
      value: {
        trusted: true,
        evidenceId: "trust.demo.connection.001",
        connectionId: "demo.connection",
        providerId: "demo",
        validUntilEpochMs: NOW + 100_000,
      },
    });
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.scope)).toBe(true);
  });

  it("caps trust validity at the provider connection expiry", () => {
    const result = evaluateViraProviderTrust({
      connection: activeConnection(),
      evidence: evidence({ expiresAtEpochMs: CONNECTION_EXPIRY + 100_000 }),
      nowEpochMs: NOW,
    });
    expect(result).toMatchObject({ ok: true, value: { validUntilEpochMs: CONNECTION_EXPIRY } });
  });

  it("rejects provider, connection, scope and credential drift", () => {
    const connection = activeConnection();
    expect(evaluateViraProviderTrust({ connection, evidence: evidence({ connectionId: "other.connection" }), nowEpochMs: NOW })).toMatchObject({ ok: false, issue: { code: "CONNECTION_MISMATCH" } });
    expect(evaluateViraProviderTrust({ connection, evidence: evidence({ providerId: "other" }), nowEpochMs: NOW })).toMatchObject({ ok: false, issue: { code: "PROVIDER_MISMATCH" } });
    expect(evaluateViraProviderTrust({
      connection,
      evidence: evidence({ scope: { version: "1", organizationId: "org-demo", projectId: "project-other", environment: "staging" } }),
      nowEpochMs: NOW,
    })).toMatchObject({ ok: false, issue: { code: "SCOPE_MISMATCH" } });
    expect(evaluateViraProviderTrust({
      connection,
      evidence: evidence({ credentialRef: { ...connection.secretRef, versionRef: "cred-attacker" } }),
      nowEpochMs: NOW,
    })).toMatchObject({ ok: false, issue: { code: "CREDENTIAL_MISMATCH" } });
  });

  it("rejects pending, revoked and expired connections", () => {
    const pending = pendingConnection();
    expect(evaluateViraProviderTrust({ connection: pending, evidence: evidence(), nowEpochMs: NOW })).toMatchObject({ ok: false, issue: { code: "CONNECTION_NOT_ACTIVE" } });
    const revoked = transitionProviderConnection(activeConnection(), "revoke", NOW + 1);
    if (!revoked.ok) throw new Error(revoked.issue.message);
    expect(evaluateViraProviderTrust({ connection: revoked.value, evidence: evidence(), nowEpochMs: NOW + 2 })).toMatchObject({ ok: false, issue: { code: "CONNECTION_NOT_ACTIVE" } });
    expect(evaluateViraProviderTrust({ connection: activeConnection(), evidence: evidence({ expiresAtEpochMs: CONNECTION_EXPIRY + 100_000 }), nowEpochMs: CONNECTION_EXPIRY })).toMatchObject({ ok: false, issue: { code: "CONNECTION_EXPIRED" } });
  });

  it("fails closed for future, expired, revoked or unhealthy trust evidence", () => {
    const connection = activeConnection();
    expect(evaluateViraProviderTrust({ connection, evidence: evidence({ issuedAtEpochMs: NOW + 1, health: { status: "healthy", checkedAtEpochMs: NOW + 1 }, expiresAtEpochMs: NOW + 100_000 }), nowEpochMs: NOW })).toMatchObject({ ok: false, issue: { code: "EVIDENCE_NOT_YET_VALID" } });
    expect(evaluateViraProviderTrust({ connection, evidence: evidence({ issuedAtEpochMs: NOW - 10_000, health: { status: "healthy", checkedAtEpochMs: NOW - 1_000 }, expiresAtEpochMs: NOW }), nowEpochMs: NOW })).toMatchObject({ ok: false, issue: { code: "EVIDENCE_EXPIRED" } });
    expect(evaluateViraProviderTrust({ connection, evidence: evidence({ revokedAtEpochMs: NOW }), nowEpochMs: NOW })).toMatchObject({ ok: false, issue: { code: "EVIDENCE_REVOKED" } });
    for (const status of ["degraded", "unhealthy"] as const) {
      expect(evaluateViraProviderTrust({ connection, evidence: evidence({ health: { status, checkedAtEpochMs: NOW - 1_000 } }), nowEpochMs: NOW })).toMatchObject({ ok: false, issue: { code: "HEALTH_NOT_TRUSTED" } });
    }
  });

  it("rejects malformed evidence and raw secret material before trust evaluation", () => {
    expect(parseViraProviderTrustEvidence({ ...evidence(), rawSecret: "must-never-enter-contract" })).toMatchObject({ ok: false, issue: { code: "INVALID_EVIDENCE" } });
    expect(parseViraProviderTrustEvidence({ ...evidence(), credentialRef: { ...activeConnection().secretRef, value: "raw-secret" } })).toMatchObject({ ok: false, issue: { code: "INVALID_CREDENTIAL_REF" } });
    expect(parseViraProviderTrustEvidence({ ...evidence(), expiresAtEpochMs: NOW - 20_000 })).toMatchObject({ ok: false, issue: { code: "INVALID_EVIDENCE" } });
    expect(evaluateViraProviderTrust({ connection: activeConnection(), evidence: evidence(), nowEpochMs: Number.NaN })).toMatchObject({ ok: false, issue: { code: "INVALID_CLOCK" } });
  });
});
