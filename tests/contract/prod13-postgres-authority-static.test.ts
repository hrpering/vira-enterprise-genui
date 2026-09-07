import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("integrations/postgres/migrations/000010_prod13_action_verification_ledger.sql", "utf8");
const verificationStore = readFileSync("integrations/postgres/src/action-verification.ts", "utf8");
const ledgerStore = readFileSync("integrations/postgres/src/production-action-ledger.ts", "utf8");

describe("PROD-13 PostgreSQL authority static boundaries", () => {
  it("keeps verification state mutable but observations append-only", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS vira.action_verification_state");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS vira.action_verification_observation");
    expect(migration).toContain("GRANT UPDATE (revision, status, lease_epoch, lease_worker_id, lease_expires_at, before_observation_digest, after_observation_digest, write_dispatched_at, record, persistence_updated_at)");
    expect(migration).toContain("GRANT SELECT, INSERT ON TABLE vira.action_verification_observation TO vira_worker");
    expect(migration).not.toMatch(/GRANT\s+UPDATE[^;]*action_verification_observation/i);
    expect(migration).not.toMatch(/GRANT\s+DELETE[^;]*action_verification_observation/i);
  });

  it("keeps historical ledger entries and checkpoints append-only", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS vira.production_action_ledger_stream");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS vira.production_action_ledger_entry");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS vira.production_action_ledger_checkpoint");
    expect(migration).toContain("GRANT UPDATE (next_sequence, chain_head_hash, updated_at) ON TABLE vira.production_action_ledger_stream TO vira_worker");
    expect(migration).toContain("GRANT SELECT, INSERT ON TABLE vira.production_action_ledger_entry TO vira_worker");
    expect(migration).toContain("GRANT SELECT, INSERT ON TABLE vira.production_action_ledger_checkpoint TO vira_worker");
    expect(migration).not.toMatch(/GRANT\s+UPDATE[^;]*production_action_ledger_entry/i);
    expect(migration).not.toMatch(/GRANT\s+DELETE[^;]*production_action_ledger_entry/i);
    expect(migration).not.toMatch(/GRANT\s+UPDATE[^;]*production_action_ledger_checkpoint/i);
    expect(migration).not.toMatch(/GRANT\s+DELETE[^;]*production_action_ledger_checkpoint/i);
  });

  it("uses row locks, DB time and revision CAS for durable verification", () => {
    expect(verificationStore).toContain("FOR UPDATE");
    expect(verificationStore).toContain("clock_timestamp()");
    expect(verificationStore).toContain("AND verification_id = $4 AND revision = $14");
    expect(verificationStore).toContain("claimViraVerificationReadback");
    expect(verificationStore).toContain("INSERT INTO vira.action_verification_observation");
  });

  it("advances only the locked ledger head after an immutable entry insert", () => {
    expect(ledgerStore).toContain("FROM vira.production_action_ledger_stream");
    expect(ledgerStore).toContain("FOR UPDATE");
    expect(ledgerStore).toContain("INSERT INTO vira.production_action_ledger_entry");
    expect(ledgerStore).toContain("SET next_sequence=$5, chain_head_hash=$6");
    expect(ledgerStore).toContain("AND next_sequence=$7 AND chain_head_hash IS NOT DISTINCT FROM $8");
    expect(ledgerStore).not.toMatch(/UPDATE\s+vira\.production_action_ledger_entry/i);
    expect(ledgerStore).not.toMatch(/DELETE\s+FROM\s+vira\.production_action_ledger_entry/i);
  });
});