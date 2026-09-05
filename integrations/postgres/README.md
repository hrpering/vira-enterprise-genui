# PostgreSQL production adapter

`integrations/postgres` is a persistence adapter, never a semantic owner.

Canonical tenant scope is the existing `enterprise-context` tuple:

```text
organizationId + projectId + environment
```

There is no independent `tenantId` authority in this adapter.

## Authority

- The only production migration root is `integrations/postgres/migrations/`.
- Production migrations are **forward-only**. A rollback deploy restores compatible application code or uses an explicit compensating migration; historical migration files are never edited or run down in place.
- `vira.schema_migrations` records immutable migration version/name/checksum evidence.
- `vira_migration` owns schema changes. Request/worker service roles do not receive migration-table writes or schema-create privileges.
- Tenant tables introduced by later semantic-owner phases must use composite scope keys/FKs plus RLS (or a reviewed equivalent) built on the scope helpers from migration `000001`.

## Runtime transactions

`withTenantTransaction()` validates the supplied enterprise scope through the canonical `enterprise-context` owner, starts a database transaction, sets scope only with transaction-local `set_config(..., true)`, verifies that the scope is complete, and then invokes the repository operation. Scope values are never interpolated into SQL.

Transaction-local settings are deliberately used so a pooled connection returns without tenant/session state after COMMIT or ROLLBACK.

## Applying migrations

The migration runner accepts `VIRA_DATABASE_URL` (or the test-only `VIRA_TEST_DATABASE_URL`):

```bash
node ops/postgres/apply-migrations.mjs
```

The caller must use migration/admin credentials. API/worker startup must never invoke this command.
