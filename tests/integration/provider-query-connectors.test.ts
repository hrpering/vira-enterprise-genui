import { describe, expect, it } from "vitest";
import { GITHUB_QUERY_CONNECTOR } from "../../integrations/connectors/github-query.js";
import { GOOGLE_WORKSPACE_QUERY_CONNECTOR } from "../../integrations/connectors/google-workspace-query.js";
import { createProviderConnection } from "../../packages/provider-connection/src/index.js";

const scope = { version: "1", organizationId: "org-reference", projectId: "project-reference", environment: "staging" } as const;

function secret(provider: string, key: string) {
  return { ...scope, provider, key };
}

describe("PROD-07 reference provider query connectors", () => {
  it("binds every GitHub query operation to an exact Capability reference", () => {
    const result = createProviderConnection({
      version: "1", id: "github.connection.reference", providerId: "github", connectorId: GITHUB_QUERY_CONNECTOR.id,
      scope, authProfileId: "github.oauth", secretRef: secret("aws.secrets", "providers/github"),
      grantedScopes: ["read:user", "read:org"], state: "pending", expiresAtEpochMs: null,
      bindings: GITHUB_QUERY_CONNECTOR.operations.map((operation) => ({
        operationId: operation.id,
        target: { kind: "query", capabilityRef: { id: `capability.${operation.id}`, versionRef: "1.0.0" } },
      })),
    }, GITHUB_QUERY_CONNECTOR);
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.value.bindings).toHaveLength(GITHUB_QUERY_CONNECTOR.operations.length);
    expect(result.value.bindings.every((binding) => binding.target.kind === "query")).toBe(true);
  });

  it("binds every Google Workspace query operation to an exact Capability reference", () => {
    const result = createProviderConnection({
      version: "1", id: "google.workspace.connection.reference", providerId: "google.workspace", connectorId: GOOGLE_WORKSPACE_QUERY_CONNECTOR.id,
      scope, authProfileId: "google.workspace.service-account", secretRef: secret("aws.secrets", "providers/google-workspace"),
      grantedScopes: [
        "https://www.googleapis.com/auth/admin.directory.user.readonly",
        "https://www.googleapis.com/auth/admin.directory.group.readonly",
      ],
      state: "pending", expiresAtEpochMs: null,
      bindings: GOOGLE_WORKSPACE_QUERY_CONNECTOR.operations.map((operation) => ({
        operationId: operation.id,
        target: { kind: "query", capabilityRef: { id: `capability.${operation.id}`, versionRef: "1.0.0" } },
      })),
    }, GOOGLE_WORKSPACE_QUERY_CONNECTOR);
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.value.bindings).toHaveLength(GOOGLE_WORKSPACE_QUERY_CONNECTOR.operations.length);
  });
});
