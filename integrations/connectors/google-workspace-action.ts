import { createConnectorKitContract } from "../../packages/adapter-sdk/src/index.js";

const result = createConnectorKitContract({
  version: "1",
  id: "google.workspace.calendar.connector.actions",
  providerId: "google.workspace",
  source: { kind: "rest", reference: "https://www.googleapis.com/calendar/v3" },
  authProfiles: [{
    id: "google.workspace.calendar.oauth",
    kind: "oauth2-pkce",
    scopes: ["https://www.googleapis.com/auth/calendar.events"],
  }],
  operations: [
    {
      id: "google.workspace.calendar.event.get",
      providerEffect: "read",
      classification: "query",
      authProfileId: "google.workspace.calendar.oauth",
      requiredScopes: ["https://www.googleapis.com/auth/calendar.events"],
      method: "GET",
      path: "/calendar/v3/calendars/{calendarId}/events/{eventId}",
      resourceType: "google.workspace.calendar.event",
      inputSchemaRef: "google.workspace.schema.calendar.event.query",
      outputSchemaRef: "google.workspace.schema.calendar.event",
      pagination: "none",
      rateLimit: "provider-headers",
      completion: "inline",
      idempotency: "none",
      retry: "query-safe",
      verification: "response",
      errorNormalization: "canonical",
    },
    {
      id: "google.workspace.calendar.event.update",
      providerEffect: "write",
      classification: "effect",
      authProfileId: "google.workspace.calendar.oauth",
      requiredScopes: ["https://www.googleapis.com/auth/calendar.events"],
      method: "PUT",
      path: "/calendar/v3/calendars/{calendarId}/events/{eventId}",
      resourceType: "google.workspace.calendar.event",
      inputSchemaRef: "google.workspace.schema.calendar.event.update",
      outputSchemaRef: "google.workspace.schema.calendar.event.write-receipt",
      pagination: "none",
      rateLimit: "provider-headers",
      completion: "inline",
      idempotency: "conditional",
      retry: "never",
      verification: "postcondition",
      errorNormalization: "canonical",
    },
  ],
  sandbox: { testOperationId: "google.workspace.calendar.event.get" },
});

if (!result.ok) throw new Error(`Google Workspace action connector rejected: ${result.issue.code} ${result.issue.message}`);

export const GOOGLE_WORKSPACE_ACTION_CONNECTOR = result.value;
