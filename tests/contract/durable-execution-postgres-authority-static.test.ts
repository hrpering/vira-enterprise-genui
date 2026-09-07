import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const store = readFileSync("integrations/postgres/src/durable-execution.ts", "utf8");
const migration = readFileSync("integrations/postgres/migrations/000009_prod12_effect_epoch_binding.sql", "utf8");

describe("PROD-12 PostgreSQL Stage B authority privilege invariants", () => {
  it("never mutates nonce or idempotency ownership on conflict", () => {
    const nonceBlock = store.slice(
      store.indexOf("INSERT INTO vira.durable_execution_nonce"),
      store.indexOf("const reservationId"),
    );
    const idempotencyBlock = store.slice(
      store.indexOf("INSERT INTO vira.durable_execution_idempotency_reservation"),
      store.indexOf("const effectResult"),
    );

    expect(nonceBlock).toContain("ON CONFLICT (organization_id, project_id, environment, nonce) DO NOTHING");
    expect(nonceBlock).toContain("SELECT nonce AS token");
    expect(nonceBlock).not.toContain("DO UPDATE");

    expect(idempotencyBlock).toContain("ON CONFLICT (organization_id, project_id, environment, idempotency_key) DO NOTHING");
    expect(idempotencyBlock).toContain("SELECT reservation_id AS token");
    expect(idempotencyBlock).not.toContain("DO UPDATE");
  });

  it("allows exact effect rebind only to a strictly higher lease epoch", () => {
    expect(store).toContain("bound_lease_epoch < $10");
    expect(store).toContain("SET bound_lease_epoch = $10");
    expect(store).toContain("input.leaseEpoch");
  });

  it("grants the worker update authority only over the effect lease binding column", () => {
    expect(migration).toContain("REVOKE UPDATE ON TABLE vira.durable_execution_effect_reservation FROM PUBLIC, vira_api, vira_worker, vira_ops");
    expect(migration).toContain("GRANT UPDATE (bound_lease_epoch) ON TABLE vira.durable_execution_effect_reservation TO vira_worker");
    expect(migration).not.toContain("GRANT UPDATE ON TABLE vira.durable_execution_effect_reservation TO vira_worker");
  });

  it("performs live-upgrade backfill under owner-only temporary RLS force relaxation and restores FORCE before commit", () => {
    const noForceEffect = migration.indexOf("durable_execution_effect_reservation NO FORCE ROW LEVEL SECURITY");
    const noForceState = migration.indexOf("durable_execution_state NO FORCE ROW LEVEL SECURITY");
    const backfill = migration.indexOf("UPDATE vira.durable_execution_effect_reservation AS reservation");
    const forceEffect = migration.indexOf("durable_execution_effect_reservation FORCE ROW LEVEL SECURITY");
    const forceState = migration.indexOf("durable_execution_state FORCE ROW LEVEL SECURITY");
    const commit = migration.lastIndexOf("COMMIT;");

    expect(noForceEffect).toBeGreaterThanOrEqual(0);
    expect(noForceState).toBeGreaterThanOrEqual(0);
    expect(backfill).toBeGreaterThan(noForceEffect);
    expect(backfill).toBeGreaterThan(noForceState);
    expect(forceEffect).toBeGreaterThan(backfill);
    expect(forceState).toBeGreaterThan(backfill);
    expect(commit).toBeGreaterThan(forceEffect);
    expect(commit).toBeGreaterThan(forceState);
  });
});
