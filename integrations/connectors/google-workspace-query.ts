import { createConnectorKitContract } from "../../packages/adapter-sdk/src/index.js";

const result = createConnectorKitContract({
  version: "1",
  id: "google.workspace.connector.query",
  providerId: "google.workspace",
  source: { kind: "rest", reference: "https://admin.googleapis.com" },
  authProfiles: [{
    id: "google.workspace.service-account",
    kind: "service-account",
    scopes: [
      "https://www.googleapis.com/auth/admin.directory.user.readonly",
      "https://www.googleapis.com/auth/admin.directory.group.readonly",
    ],
  }],
  operations: [
    {
      id: "google.workspace.user.get",
      providerEffect: "read", classification: "query", authProfileId: "google.workspace.service-account",
      requiredScopes: ["https://www.googleapis.com/auth/admin.directory.user.readonly"], method: "GET",
      path: "/admin/directory/v1/users/{userKey}", resourceType: "google.workspace.user", inputSchemaRef: "google.workspace.schema.user.query", outputSchemaRef: "google.workspace.schema.user",
      pagination: "none", rateLimit: "provider-headers", completion: "inline", idempotency: "none", retry: "query-safe", verification: "response", errorNormalization: "canonical",
    },
    {
      id: "google.workspace.groups.list",
      providerEffect: "read", classification: "query", authProfileId: "google.workspace.service-account",
      requiredScopes: ["https://www.googleapis.com/auth/admin.directory.group.readonly"], method: "GET",
      path: "/admin/directory/v1/groups", resourceType: "google.workspace.group", inputSchemaRef: "google.workspace.schema.groups.query", outputSchemaRef: "google.workspace.schema.group.list",
      pagination: "page", rateLimit: "provider-headers", completion: "inline", idempotency: "none", retry: "query-safe", verification: "response", errorNormalization: "canonical",
    },
  ],
  sandbox: { testOperationId: "google.workspace.user.get" },
});
if (!result.ok) throw new Error(`Google Workspace connector rejected: ${result.issue.code} ${result.issue.message}`);
export const GOOGLE_WORKSPACE_QUERY_CONNECTOR = result.value;
