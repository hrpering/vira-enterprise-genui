import { describe, expect, it } from "vitest";
import { createConnectorKitContract } from "../../packages/adapter-sdk/src/index.js";
import { createProviderConnection, transitionProviderConnection } from "../../packages/provider-connection/src/index.js";

const connectorResult = createConnectorKitContract({
  version: "1", id: "demo.connector", providerId: "demo", source: { kind: "rest", reference: "https://api.example.com" },
  authProfiles: [
    { id: "demo.auth", kind: "api-key", scopes: ["items:read", "items:write"] },
    { id: "demo.alt", kind: "oidc", scopes: ["items:read"] },
  ],
  operations: [
    { id: "demo.item.get", providerEffect: "read", classification: "query", authProfileId: "demo.auth", requiredScopes: ["items:read"], method: "GET", path: "/items/{id}", resourceType: "demo.item", inputSchemaRef: "demo.schema.item.query", outputSchemaRef: "demo.schema.item", pagination: "none", rateLimit: "provider-headers", completion: "inline", idempotency: "none", retry: "query-safe", verification: "response", errorNormalization: "canonical" },
    { id: "demo.item.delete", providerEffect: "write", classification: "effect", authProfileId: "demo.auth", requiredScopes: ["items:write"], method: "DELETE", path: "/items/{id}", resourceType: "demo.item", inputSchemaRef: "demo.schema.item.delete", outputSchemaRef: null, pagination: "none", rateLimit: "provider-headers", completion: "inline", idempotency: "provider-key", retry: "never", verification: "postcondition", errorNormalization: "canonical" },
    { id: "demo.alt.get", providerEffect: "read", classification: "query", authProfileId: "demo.alt", requiredScopes: ["items:read"], method: "GET", path: "/alt/items/{id}", resourceType: "demo.item", inputSchemaRef: "demo.schema.item.query", outputSchemaRef: "demo.schema.item", pagination: "none", rateLimit: "provider-headers", completion: "inline", idempotency: "none", retry: "query-safe", verification: "response", errorNormalization: "canonical" },
  ],
  sandbox: { testOperationId: "demo.item.get" },
});
if (!connectorResult.ok) throw new Error(connectorResult.issue.message);
const connector = connectorResult.value;

function connection(overrides: Record<string, unknown> = {}) {
  return {
    version: "1", id: "demo.connection", providerId: "demo", connectorId: "demo.connector",
    scope: { version: "1", organizationId: "org-demo", projectId: "project-demo", environment: "staging" },
    authProfileId: "demo.auth",
    secretRef: { version: "1", organizationId: "org-demo", projectId: "project-demo", environment: "staging", provider: "aws.secrets", key: "providers/demo" },
    grantedScopes: ["items:read", "items:write"], state: "pending", expiresAtEpochMs: 2_000_000_000_000,
    bindings: [
      { operationId: "demo.item.get", target: { kind: "query", capabilityRef: { id: "demo.capability.item.get", versionRef: "1.0.0" } } },
      { operationId: "demo.item.delete", target: { kind: "action", actionRef: { id: "demo.action.item.delete", versionRef: "1.0.0" } } },
    ],
    ...overrides,
  };
}

describe("PROD-07 provider connection", () => {
  it("binds only the selected auth-profile operations, freezes nested targets, then activates", () => {
    const created = createProviderConnection(connection(), connector);
    expect(created.ok).toBe(true); if (!created.ok) return;
    expect(created.value.bindings).toEqual([
      { operationId: "demo.item.get", target: { kind: "query", capabilityRef: { id: "demo.capability.item.get", versionRef: "1.0.0" } } },
      { operationId: "demo.item.delete", target: { kind: "action", actionRef: { id: "demo.action.item.delete", versionRef: "1.0.0" } } },
    ]);
    expect(Object.isFrozen(created.value.bindings[0])).toBe(true);
    expect(Object.isFrozen(created.value.bindings[0]?.target)).toBe(true);
    expect(transitionProviderConnection(created.value, "activate", 1_900_000_000_000)).toMatchObject({ ok: true, value: { state: "active" } });
  });

  it("requires explicit pending creation and rejects operations owned by another auth profile", () => {
    expect(createProviderConnection(connection({ state: "active" }), connector)).toMatchObject({ ok: false, issue: { code: "INITIAL_STATE_REQUIRED" } });
    expect(createProviderConnection(connection({ bindings: [
      { operationId: "demo.item.get", target: { kind: "query", capabilityRef: { id: "demo.capability.item.get", versionRef: "1.0.0" } } },
      { operationId: "demo.item.delete", target: { kind: "action", actionRef: { id: "demo.action.item.delete", versionRef: "1.0.0" } } },
      { operationId: "demo.alt.get", target: { kind: "query", capabilityRef: { id: "demo.capability.alt.get", versionRef: "1.0.0" } } },
    ] }), connector)).toMatchObject({ ok: false, issue: { code: "OPERATION_AUTH_PROFILE_MISMATCH" } });
  });

  it("rejects effect→query and query→action authority confusion", () => {
    expect(createProviderConnection(connection({ bindings: [
      { operationId: "demo.item.get", target: { kind: "query", capabilityRef: { id: "demo.capability.item.get", versionRef: "1.0.0" } } },
      { operationId: "demo.item.delete", target: { kind: "query", capabilityRef: { id: "demo.capability.item.delete", versionRef: "1.0.0" } } },
    ] }), connector)).toMatchObject({ ok: false, issue: { code: "EFFECT_REQUIRES_ACTION" } });
    expect(createProviderConnection(connection({ bindings: [
      { operationId: "demo.item.get", target: { kind: "action", actionRef: { id: "demo.action.item.get", versionRef: "1.0.0" } } },
      { operationId: "demo.item.delete", target: { kind: "action", actionRef: { id: "demo.action.item.delete", versionRef: "1.0.0" } } },
    ] }), connector)).toMatchObject({ ok: false, issue: { code: "QUERY_REQUIRES_CAPABILITY" } });
  });

  it("delegates floating exact references to canonical reference owners", () => {
    expect(createProviderConnection(connection({ bindings: [
      { operationId: "demo.item.get", target: { kind: "query", capabilityRef: { id: "demo.capability.item.get", versionRef: "latest" } } },
      { operationId: "demo.item.delete", target: { kind: "action", actionRef: { id: "demo.action.item.delete", versionRef: "1.0.0" } } },
    ] }), connector)).toMatchObject({ ok: false, issue: { code: "INVALID_TARGET_REFERENCE", sourceCode: "FLOATING_REFERENCE" } });
  });

  it("rejects cross-environment secrets, raw secret fields and missing provider scopes", () => {
    expect(createProviderConnection(connection({ secretRef: { version: "1", organizationId: "org-demo", projectId: "project-demo", environment: "production", provider: "aws.secrets", key: "providers/demo" } }), connector)).toMatchObject({ ok: false, issue: { code: "INVALID_SECRET_REF" } });
    expect(createProviderConnection(connection({ secretValue: "must-never-enter-contract" }), connector)).toMatchObject({ ok: false, issue: { code: "INVALID_CONNECTION" } });
    expect(createProviderConnection(connection({ secretRef: { version: "1", organizationId: "org-demo", projectId: "project-demo", environment: "staging", provider: "aws.secrets", key: "providers/demo", value: "raw-secret" } }), connector)).toMatchObject({ ok: false, issue: { code: "INVALID_SECRET_REF" } });
    expect(createProviderConnection(connection({ grantedScopes: ["items:read"] }), connector)).toMatchObject({ ok: false, issue: { code: "MISSING_REQUIRED_SCOPE" } });
  });

  it("makes revoked/expired states terminal and refuses activation after expiry", () => {
    const created = createProviderConnection(connection(), connector); expect(created.ok).toBe(true); if (!created.ok) return;
    const revoked = transitionProviderConnection(created.value, "revoke", 1_900_000_000_000); expect(revoked.ok).toBe(true); if (!revoked.ok) return;
    expect(transitionProviderConnection(revoked.value, "activate", 1_900_000_000_001)).toMatchObject({ ok: false, issue: { code: "INVALID_TRANSITION" } });
    expect(transitionProviderConnection(created.value, "activate", 2_000_000_000_001)).toMatchObject({ ok: false, issue: { code: "INVALID_TRANSITION" } });
    const expired = transitionProviderConnection(created.value, "expire", 1_900_000_000_002); expect(expired.ok).toBe(true); if (!expired.ok) return;
    expect(transitionProviderConnection(expired.value, "activate", 1_900_000_000_003)).toMatchObject({ ok: false, issue: { code: "INVALID_TRANSITION" } });
  });
});
