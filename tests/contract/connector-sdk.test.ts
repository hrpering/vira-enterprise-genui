import { describe, expect, it } from "vitest";
import { createConnectorKitContract } from "../../packages/adapter-sdk/src/index.js";
import { GITHUB_QUERY_CONNECTOR } from "../../integrations/connectors/github-query.js";
import { GOOGLE_WORKSPACE_QUERY_CONNECTOR } from "../../integrations/connectors/google-workspace-query.js";

function effectConnector(overrides: Record<string, unknown> = {}, sandboxOperationId = "demo.item.get") {
  return {
    version: "1", id: "demo.connector", providerId: "demo", source: { kind: "rest", reference: "https://api.example.com" },
    authProfiles: [{ id: "demo.auth", kind: "api-key", scopes: ["items:read", "items:write"] }],
    operations: [
      {
        id: "demo.item.get", providerEffect: "read", classification: "query", authProfileId: "demo.auth", requiredScopes: ["items:read"],
        method: "GET", path: "/items/{id}", resourceType: "demo.item", inputSchemaRef: "demo.schema.item.query", outputSchemaRef: "demo.schema.item",
        pagination: "none", rateLimit: "provider-headers", completion: "inline", idempotency: "none", retry: "query-safe", verification: "response", errorNormalization: "canonical",
      },
      {
        id: "demo.item.delete", providerEffect: "write", classification: "effect", authProfileId: "demo.auth", requiredScopes: ["items:write"],
        method: "DELETE", path: "/items/{id}", resourceType: "demo.item", inputSchemaRef: "demo.schema.item.delete", outputSchemaRef: null,
        pagination: "none", rateLimit: "provider-headers", completion: "inline", idempotency: "provider-key", retry: "never", verification: "postcondition", errorNormalization: "canonical",
        ...overrides,
      },
    ],
    sandbox: { testOperationId: sandboxOperationId },
  };
}

describe("PROD-07 Connector Kit", () => {
  it("accepts GitHub and Google Workspace query connector declarations", () => {
    expect(GITHUB_QUERY_CONNECTOR.providerId).toBe("github");
    expect(GITHUB_QUERY_CONNECTOR.operations.every((operation) => operation.classification === "query")).toBe(true);
    expect(GOOGLE_WORKSPACE_QUERY_CONNECTOR.providerId).toBe("google.workspace");
    expect(GOOGLE_WORKSPACE_QUERY_CONNECTOR.operations.some((operation) => operation.pagination === "page")).toBe(true);
  });

  it("rejects a provider write that is presented as query", () => {
    expect(createConnectorKitContract(effectConnector({ classification: "query" }))).toMatchObject({ ok: false, issue: { code: "WRITE_AS_QUERY" } });
  });

  it("rejects unsafe effect retry, idempotency and verification policy", () => {
    expect(createConnectorKitContract(effectConnector({ retry: "query-safe" }))).toMatchObject({ ok: false, issue: { code: "UNSAFE_EFFECT_POLICY" } });
    expect(createConnectorKitContract(effectConnector({ verification: "response" }))).toMatchObject({ ok: false, issue: { code: "UNSAFE_EFFECT_POLICY" } });
    expect(createConnectorKitContract(effectConnector({ idempotency: "none" }))).toMatchObject({ ok: false, issue: { code: "UNSAFE_EFFECT_POLICY" } });
  });

  it("rejects an effect operation as the sandbox probe", () => {
    expect(createConnectorKitContract(effectConnector({}, "demo.item.delete"))).toMatchObject({ ok: false, issue: { code: "UNSAFE_SANDBOX_OPERATION" } });
  });

  it("rejects auth, scope, rate-limit and schema declaration failures", () => {
    expect(createConnectorKitContract(effectConnector({ authProfileId: "missing" }))).toMatchObject({ ok: false, issue: { code: "UNKNOWN_AUTH_PROFILE" } });
    expect(createConnectorKitContract(effectConnector({ requiredScopes: ["unknown"] }))).toMatchObject({ ok: false, issue: { code: "UNDECLARED_SCOPE" } });
    expect(createConnectorKitContract(effectConnector({ rateLimit: "magic" }))).toMatchObject({ ok: false, issue: { code: "INVALID_OPERATION" } });
    expect(createConnectorKitContract(effectConnector({ outputSchemaRef: "not a schema ref" }))).toMatchObject({ ok: false, issue: { code: "INVALID_OPERATION" } });
  });

  it("rejects duplicate operations and non-canonical error normalization", () => {
    const base = effectConnector();
    const operation = base.operations[0]!;
    expect(createConnectorKitContract({ ...base, operations: [operation, { ...operation }] })).toMatchObject({ ok: false, issue: { code: "DUPLICATE_OPERATION" } });
    expect(createConnectorKitContract(effectConnector({ errorNormalization: "raw-provider-error" }))).toMatchObject({ ok: false, issue: { code: "INVALID_OPERATION" } });
  });
});
