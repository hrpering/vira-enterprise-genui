# Live PostgreSQL Recovery Evidence Gate

**Status:** verifier implementation only. This gate does not create backups, restore databases, deploy services, or mutate Railway resources.

`LIVE_GATE_BLOCKERS.md` requires a real PostgreSQL backup/restore rehearsal plus a migration rollback rehearsal in an isolated production-like environment. The existing CI already proves logical `pg_dump -> drop -> pg_restore`, migration evidence, RLS, and worker isolation. That is useful repository evidence, but it is not managed-provider recovery authority.

This gate covers the **managed Railway PostgreSQL backup/restore evidence** half only. A successful run deliberately leaves `migration-rollback-rehearsal` open.

## Authority model

A pass is based on two independent live sources:

1. **Railway API authority**
   - exact source volume instance;
   - exact backup ID attached to that source volume;
   - backup creation timestamp and metadata;
   - independent restored volume instance and service identity.
2. **PostgreSQL authority**
   - source and restored databases are independently addressable;
   - the backup boundary is proven with pre/post recovery markers;
   - every numbered repository migration has exact SHA-256 checksum parity;
   - required database roles and scope functions exist after restore;
   - tenant tables remain forced-RLS protected;
   - `vira_api` still lacks migration-evidence write authority.

Operator-written JSON is therefore not sufficient by itself. The manifest supplies expected identities, but the verifier must independently observe them from Railway and PostgreSQL.

## Isolated staging prerequisite

The verifier accepts only:

```text
staging
```

A manifest naming `production` fails before provider or database access.

Use a dedicated recovery-drill PostgreSQL source service/volume. Do not point this procedure at the production database.

## Recovery marker table

`vira.recovery_drill_markers` is intentionally **not** part of the product migration chain. It is drill-only evidence and must be created by the operator on the isolated staging source before the rehearsal.

Using migration/operations authority, create:

```sql
CREATE TABLE IF NOT EXISTS vira.recovery_drill_markers (
  marker uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
```

The proof sequence is strict:

1. insert `beforeMarker` into the isolated staging source;
2. create/select the managed Railway backup;
3. insert `afterMarker` into the source;
4. restore the selected backup into an **independent sibling Railway PostgreSQL volume/service**;
5. verify the source contains both markers;
6. verify the restored database contains `beforeMarker` but **not** `afterMarker`.

The verifier additionally requires Railway's live backup `createdAt` timestamp to fall strictly between the two source marker timestamps. This prevents a different backup from being substituted after the fact.

## Required recovery manifest

Set `VIRA_RECOVERY_MANIFEST_JSON` only in the trusted operator environment:

```json
{
  "version": "1",
  "environment": "staging",
  "owner": "release-engineering",
  "candidateSha": "<exact-git-sha>",
  "sourceVolumeInstanceId": "<exact-source-volume-instance-uuid>",
  "restoredVolumeInstanceId": "<exact-restored-volume-instance-uuid>",
  "backupId": "<exact-railway-backup-uuid>",
  "sourceServiceName": "<source-postgres-service-name>",
  "restoredServiceName": "<restored-postgres-service-name>",
  "beforeMarker": "<uuid-inserted-before-backup>",
  "afterMarker": "<uuid-inserted-after-backup>",
  "restoreStartedAt": "2026-09-07T17:00:00.000Z",
  "restoreCompletedAt": "2026-09-07T17:05:00.000Z"
}
```

The candidate SHA must equal the clean checkout running the verifier.

## Required live credentials

Set these only in the operator/private-runner environment:

```bash
export VIRA_RAILWAY_READ_TOKEN='...'
export VIRA_RECOVERY_SOURCE_DATABASE_URL='postgresql://...'
export VIRA_RECOVERY_RESTORED_DATABASE_URL='postgresql://...'
export VIRA_RECOVERY_MANIFEST_JSON='...'
```

`RAILWAY_TOKEN` is accepted as a fallback to `VIRA_RAILWAY_READ_TOKEN`.

Do not paste Railway tokens or database URLs into PRs, issues, chat transcripts, logs, or evidence documents.

The Railway token only needs authority to read the relevant volume instances and backup list. The verifier performs no Railway mutation.

## Run the evidence gate

From the exact clean candidate checkout:

```bash
node tooling/verify-live-recovery-evidence.mjs
```

A successful managed backup/restore proof emits JSON with:

```json
{
  "gate": "live-postgres-backup-restore",
  "authority": "live-railway-api+postgres",
  "closureEligible": true,
  "releaseRecoveryClosureEligible": false,
  "openBlockers": ["migration-rollback-rehearsal"]
}
```

The output also records the exact backup ID, source/restored volume identities, migration count/checksum parity, restored security invariants, RTO seconds, manifest digest, and observation timestamp.

Any missing secret/configuration, dirty checkout, candidate-SHA mismatch, reused source/restored volume, missing backup provenance, timestamp-boundary mismatch, marker mismatch, migration drift, missing RLS/security invariant, or PostgreSQL query failure exits non-zero with `closureEligible=false`.

## What this gate does not prove

This gate does **not** close the full recovery blocker. In particular it does not prove:

- application rollback to an older immutable deployment while remaining compatible with the current forward-only schema;
- compensating migration execution;
- Railway API/worker restart/rollback;
- object-store recovery;
- KMS/secret-provider recovery.

The repository's production runbook explicitly treats migrations as forward-only. Therefore a migration rollback rehearsal must be designed around an older application release plus compatible current schema and/or a reviewed compensating migration, not by editing or deleting previously applied numbered migrations.

Until that independent application/migration rollback rehearsal is executed and observed, `releaseRecoveryClosureEligible` must remain false.
