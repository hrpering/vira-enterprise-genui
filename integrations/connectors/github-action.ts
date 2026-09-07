import { createConnectorKitContract } from "../../packages/adapter-sdk/src/index.js";

const result = createConnectorKitContract({
  version: "1",
  id: "github.connector.actions",
  providerId: "github",
  source: { kind: "rest", reference: "https://api.github.com" },
  authProfiles: [{
    id: "github.oauth.contents",
    kind: "oauth2-pkce",
    scopes: ["repo"],
  }],
  operations: [
    {
      id: "github.repository.file.get",
      providerEffect: "read",
      classification: "query",
      authProfileId: "github.oauth.contents",
      requiredScopes: ["repo"],
      method: "GET",
      path: "/repos/{owner}/{repo}/contents/{path}",
      resourceType: "github.repository.file",
      inputSchemaRef: "github.schema.repository.file.query",
      outputSchemaRef: "github.schema.repository.file",
      pagination: "none",
      rateLimit: "provider-headers",
      completion: "inline",
      idempotency: "none",
      retry: "query-safe",
      verification: "response",
      errorNormalization: "canonical",
    },
    {
      id: "github.repository.file.update",
      providerEffect: "write",
      classification: "effect",
      authProfileId: "github.oauth.contents",
      requiredScopes: ["repo"],
      method: "PUT",
      path: "/repos/{owner}/{repo}/contents/{path}",
      resourceType: "github.repository.file",
      inputSchemaRef: "github.schema.repository.file.update",
      outputSchemaRef: "github.schema.repository.file.write-receipt",
      pagination: "none",
      rateLimit: "provider-headers",
      completion: "inline",
      idempotency: "conditional",
      retry: "never",
      verification: "postcondition",
      errorNormalization: "canonical",
    },
  ],
  sandbox: { testOperationId: "github.repository.file.get" },
});

if (!result.ok) throw new Error(`GitHub action connector rejected: ${result.issue.code} ${result.issue.message}`);

export const GITHUB_ACTION_CONNECTOR = result.value;
