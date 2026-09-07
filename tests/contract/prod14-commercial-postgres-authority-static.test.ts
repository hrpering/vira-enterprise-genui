import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../integrations/postgres/migrations/000011_prod14_commercial_usage.sql", import.meta.url),
  "utf8",
);
const invoiceMigration = readFileSync(
  new URL("../../integrations/postgres/migrations/000012_prod14_invoice_export.sql", import.meta.url),
  "utf8",
);

describe("PROD-14 commercial PostgreSQL authority", () => {
  it("creates tenant-scoped append-only source-event and usage tables", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS vira.commercial_usage_source_event");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS vira.commercial_usage_record");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("vira.scope_matches(organization_id, project_id, environment)");
    expect(migration).toContain("FOREIGN KEY (organization_id, project_id, environment, verification_id)");
    expect(migration).toContain("REFERENCES vira.action_verification_state");
    expect(migration).toContain("REFERENCES vira.commercial_usage_source_event");
  });

  it("does not grant UPDATE or DELETE on historical commercial truth", () => {
    expect(migration).toContain("GRANT SELECT, INSERT ON TABLE vira.commercial_usage_source_event TO vira_worker");
    expect(migration).toContain("GRANT SELECT, INSERT ON TABLE vira.commercial_usage_record TO vira_worker");
    expect(migration).not.toMatch(/GRANT\s+UPDATE[^;]*commercial_usage_source_event/i);
    expect(migration).not.toMatch(/GRANT\s+UPDATE[^;]*commercial_usage_record/i);
    expect(migration).not.toMatch(/GRANT\s+DELETE[^;]*commercial_usage_source_event/i);
    expect(migration).not.toMatch(/GRANT\s+DELETE[^;]*commercial_usage_record/i);
  });

  it("binds source-event identity to verification and commercial coordinates", () => {
    expect(migration).toContain("commercial_usage_source_verification_meter_idx");
    expect(migration).toContain("event -> 'authority' ->> 'verificationId' = verification_id");
    expect(migration).toContain("event -> 'authority' ->> 'executionId' = execution_id");
    expect(migration).toContain("event -> 'entitlementRef' ->> 'id' = entitlement_id");
    expect(migration).toContain("event -> 'meteringRef' ->> 'id' = metering_id");
    expect(migration).toContain("usage_record ->> 'usageId' = usage_id");
    expect(migration).toContain("usage_record -> 'scope' ->> 'organizationId' = organization_id");
  });

  it("registers migration version 11 without rewriting previous migrations", () => {
    expect(migration).toContain("WHERE version = 11");
    expect(migration).toContain("VALUES (11, 'prod14_commercial_usage'");
  });
});

describe("PROD-14 invoice export PostgreSQL authority", () => {
  it("uses a forward-only immutable tenant-scoped invoice export migration", () => {
    expect(invoiceMigration).toContain("CREATE TABLE IF NOT EXISTS vira.commercial_invoice_export");
    expect(invoiceMigration).toContain("FORCE ROW LEVEL SECURITY");
    expect(invoiceMigration).toContain("FOR INSERT TO vira_worker");
    expect(invoiceMigration).not.toMatch(/FOR UPDATE|FOR DELETE|GRANT\s+UPDATE|GRANT\s+DELETE/i);
    expect(invoiceMigration).toContain("version = 12");
    expect(invoiceMigration).toContain("prod14_invoice_export");
  });

  it("binds relational authority columns back to canonical JSON evidence", () => {
    for (const constraint of [
      "commercial_invoice_export_scope_organization",
      "commercial_invoice_export_scope_project",
      "commercial_invoice_export_scope_environment",
      "commercial_invoice_export_source_digest_json",
      "commercial_invoice_export_content_digest_json",
      "commercial_invoice_export_total_json",
    ]) expect(invoiceMigration).toContain(constraint);
  });
});
