# PostgreSQL production runbook — PROD-02 foundation

## Roles

- `vira_migration`: schema/migration authority only.
- `vira_api`: request repository role; no schema migration authority.
- `vira_worker`: worker repository/claim role; no schema migration authority.
- `vira_ops`: read-only migration evidence plus separately reviewed operational grants.

Concrete LOGIN identities are environment-specific and must be provisioned outside source control, then granted only the required group role. Request services must never start with migration/admin credentials.

## Migration procedure

1. Snapshot/confirm Railway backup/PITR status before a production migration window.
2. Run `node ops/postgres/apply-migrations.mjs` with migration credentials and the target environment's `VIRA_DATABASE_URL`.
3. Record exact release SHA, migration versions/checksums, operator identity, start/end time, and outcome.
4. Deploy API/worker only after the migration gate succeeds.
5. Verify `/readyz`, error rate, connection saturation, and tenant-isolation probes.

Migrations are forward-only. Never edit an already-applied numbered migration. If a schema change must be reversed, ship a new compensating migration after owner/security review; application rollback must remain compatible with the already-applied schema.

## Restore exercise

CI performs a logical dump→drop→restore proof for the `vira` schema. Production recovery uses the managed Railway PostgreSQL backup/PITR mechanism first, then verifies:

- migration version/checksum parity;
- RLS/policy/function presence;
- tenant-scoped smoke queries;
- worker claim isolation;
- application readiness before traffic restoration.

A restore is not considered successful merely because PostgreSQL starts.

## Pool safety

Every request/worker repository operation must use the transaction helper or an equivalent reviewed adapter path that sets `organizationId`, `projectId`, and `environment` with transaction-local settings. No session-level tenant GUC is allowed. COMMIT/ROLLBACK must return the pooled connection without scope state.
