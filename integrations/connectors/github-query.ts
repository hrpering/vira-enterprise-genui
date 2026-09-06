import { createConnectorKitContract } from "../../packages/adapter-sdk/src/index.js";

const result = createConnectorKitContract({
  version: "1",
  id: "github.connector.query",
  providerId: "github",
  source: { kind: "rest", reference: "https://api.github.com" },
  authProfiles: [{ id: "github.oauth", kind: "oauth2-pkce", scopes: ["read:user", "read:org"] }],
  operations: [
    {
      id: "github.user.get",
      providerEffect: "read", classification: "query", authProfileId: "github.oauth", requiredScopes: ["read:user"],
      method: "GET", path: "/user", resourceType: "github.user", inputSchemaRef: null, outputSchemaRef: "github.schema.user",
      pagination: "none", rateLimit: "provider-headers", completion: "inline", idempotency: "none", retry: "query-safe", verification: "response", errorNormalization: "canonical",
    },
    {
      id: "github.org.membership.get",
      providerEffect: "read", classification: "query", authProfileId: "github.oauth", requiredScopes: ["read:org"],
      method: "GET", path: "/orgs/{org}/memberships/{username}", resourceType: "github.organization.membership", inputSchemaRef: "github.schema.membership.query", outputSchemaRef: "github.schema.membership",
      pagination: "none", rateLimit: "provider-headers", completion: "inline", idempotency: "none", retry: "query-safe", verification: "response", errorNormalization: "canonical",
    },
  ],
  sandbox: { testOperationId: "github.user.get" },
});
if (!result.ok) throw new Error(`GitHub connector rejected: ${result.issue.code} ${result.issue.message}`);
export const GITHUB_QUERY_CONNECTOR = result.value;
