# ADR PROD-02-001 — PostgreSQL authority and tenant isolation

**Status:** ACCEPTED for PROD-02 candidate  
**Date:** 2026-09-05

## Decision

PostgreSQL is a persistence adapter, not a semantic owner. The sole production migration root is:

```text
integrations/postgres/migrations/
```

The adapter consumes the canonical enterprise scope already owned by `enterprise-context`:

```text
organizationId + projectId + environment
```

No database-specific `tenantId`, transaction meaning, runtime meaning, ledger meaning, or commercial meaning may become canonical.

## Migration authority

`vira.schema_migrations` stores ordered version, immutable name, SHA-256 checksum, and apply timestamp. Migration execution is serialized with a PostgreSQL advisory transaction lock. Applied migration content is immutable: checksum mismatch fails closed.

Production migrations are forward-only. Rollback of application code must remain schema compatible; schema reversal requires a new compensating migration. Request/API/worker processes do not run migrations.

Roles are separated into `vira_migration`, `vira_api`, `vira_worker`, and `vira_ops`. Group roles are source-defined as `NOLOGIN`, non-superuser, non-create-role/database, non-replication, and `NOBYPASSRLS`; environment LOGIN identities and credentials are provisioned externally.

## Tenant isolation

Every future tenant-owned durable table must either carry the exact scope tuple directly or inherit it through a tenant-safe parent key. Cross-scope foreign keys must include the scope tuple. RLS/equivalent policies default-deny when scope is absent and match rows with `vira.scope_matches(...)`.

The transaction adapter validates scope through `enterprise-context`, then uses parameterized transaction-local PostgreSQL settings. Session-level tenant settings are forbidden because pooled connections are reused.

RLS is defense in depth, not a replacement for application authorization. Identity/delegation is owned by PROD-03 and later governance/execution owners remain mandatory.

## Proof

Hosted CI uses a real PostgreSQL service and proves:

- no-scope reads return no tenant rows;
- tenant A cannot read/write tenant B rows;
- composite tenant FK prevents parent confusion;
- worker `FOR UPDATE SKIP LOCKED` claims stay within the exact scope;
- transaction-local settings clear on the same reused connection after commit;
- API role cannot mutate migration evidence;
- logical dump/drop/restore preserves migration evidence and fixture data;
- the restored database accepts the same immutable migration checksum.

Managed production backup/PITR remains the recovery authority; logical CI restore is an engineering proof, not a substitute for provider backup policy.
