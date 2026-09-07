import { describe, expect, it } from "vitest";
import { GITHUB_ACTION_CONNECTOR } from "../../integrations/connectors/github-action.js";
import { GOOGLE_WORKSPACE_ACTION_CONNECTOR } from "../../integrations/connectors/google-workspace-action.js";

function operation(
  connector: typeof GITHUB_ACTION_CONNECTOR | typeof GOOGLE_WORKSPACE_ACTION_CONNECTOR,
  id: string,
) {
  const found = connector.operations.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`missing operation ${id}`);
  return found;
}

describe("PROD-13 reference provider protected Action declarations", () => {
  it("declares GitHub file update only as conditional, non-generic-retry, postcondition-verified effect", () => {
    const read = operation(GITHUB_ACTION_CONNECTOR, "github.repository.file.get");
    const write = operation(GITHUB_ACTION_CONNECTOR, "github.repository.file.update");

    expect(read).toMatchObject({
      providerEffect: "read",
      classification: "query",
      method: "GET",
      resourceType: "github.repository.file",
      retry: "query-safe",
      verification: "response",
    });
    expect(write).toMatchObject({
      providerEffect: "write",
      classification: "effect",
      method: "PUT",
      resourceType: "github.repository.file",
      idempotency: "conditional",
      retry: "never",
      verification: "postcondition",
    });
    expect(GITHUB_ACTION_CONNECTOR.sandbox.testOperationId).toBe("github.repository.file.get");
  });

  it("declares Google Calendar update only as conditional, non-generic-retry, postcondition-verified effect", () => {
    const read = operation(GOOGLE_WORKSPACE_ACTION_CONNECTOR, "google.workspace.calendar.event.get");
    const write = operation(GOOGLE_WORKSPACE_ACTION_CONNECTOR, "google.workspace.calendar.event.update");

    expect(read).toMatchObject({
      providerEffect: "read",
      classification: "query",
      method: "GET",
      resourceType: "google.workspace.calendar.event",
      retry: "query-safe",
      verification: "response",
    });
    expect(write).toMatchObject({
      providerEffect: "write",
      classification: "effect",
      method: "PUT",
      resourceType: "google.workspace.calendar.event",
      idempotency: "conditional",
      retry: "never",
      verification: "postcondition",
    });
    expect(GOOGLE_WORKSPACE_ACTION_CONNECTOR.sandbox.testOperationId).toBe("google.workspace.calendar.event.get");
  });

  it("never uses a protected write as the connector sandbox operation", () => {
    for (const connector of [GITHUB_ACTION_CONNECTOR, GOOGLE_WORKSPACE_ACTION_CONNECTOR]) {
      const sandbox = operation(connector, connector.sandbox.testOperationId);
      expect(sandbox.classification).toBe("query");
      expect(sandbox.providerEffect).toBe("read");
    }
  });
});
