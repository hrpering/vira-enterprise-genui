# Backup and restore verification

This runbook is executable guidance, not proof that a live restore occurred.

1. Resolve an exact Railway PostgreSQL backup reference; floating `latest` references are forbidden.
2. Record and independently verify its SHA-256 digest before restore.
3. Generate the deterministic `dry-run` plan with `createRestoreDryRunPlan`.
4. Restore only into an isolated `restore-verification` database with ownership and privileges disabled.
5. Apply forward migrations, then run integrity, tenant-isolation, ledger, and billing-export checks.
6. Capture timestamps, operator, exact build SHA, backup ref, checksum, test output, and teardown evidence.
7. Destroy the isolated database. Never overwrite production as part of verification.

The real Railway backup/restore drill remains an open live gate in `docs/production/LIVE_GATE_BLOCKERS.md`.
