# ADR PROD-00-004 — API Versioning, Migration, Rollback and Feature Flags

**Status:** ACCEPTED  
**Date:** 2026-09-05

## API and contract versioning

- Public HTTP APIs begin under explicit `/v1` route families.
- Additive backwards-compatible fields may ship within a major version when existing strict parsers are not broken.
- Breaking semantic changes require a new major contract/API version and an explicit migrator where persisted/portable data exists.
- Exact semantic references never interpret `latest`, wildcard or silent fallback for protected execution.
- Canonical Application V1→V2 is an explicit migration in PROD-04; ambiguous Action identity mapping fails closed.

## Database migration authority

`integrations/postgres/migrations/` is the only production migration root once PROD-02 creates it.

Production migration rules:

1. expand before code depends on the new shape;
2. deploy code compatible with old + new during the rollback window;
3. backfill through explicit bounded/restartable jobs where required;
4. contract/destructive cleanup only after no supported binary requires the old shape;
5. API/worker identities never receive migration/superuser credentials;
6. migration failure stops promotion; it is never auto-ignored.

Schema rollback is not assumed to be safe. Application rollback is preferred while the schema remains backward compatible; destructive migrations need a separately reviewed restore/forward-fix plan.

## Build and deployment promotion

- Build once; promote the identical immutable artifact/image digest from staging to production.
- Production activation records exact release/digest/provenance.
- Rollback activates a previously known exact release; it does not mutate release identity.
- Environment config and secret references are external bindings, not baked mutable credentials in canonical Application artifacts.

## Feature flags

- Server-side evaluation for security-sensitive/runtime behavior.
- Tenant + environment scoping is explicit.
- New protected-write paths default **off** until their owning phase release gate passes.
- A flag cannot bypass authentication, governance, Action Boundary, approval, grant, idempotency, verification or tenant checks.
- Flag state changes affecting protected execution are auditable.
- Emergency kill switches may disable a write/provider/runtime path; they may not turn a fail-closed requirement into fail-open behavior.

## Rollback policy

A rollback is valid only if:

- exact artifact identity is known;
- database shape is compatible or a reviewed recovery path exists;
- affected workers do not consume incompatible queued/outbox data;
- provider webhooks/events remain dedupe/replay safe;
- current transaction/Action states cannot be silently reinterpreted by the old binary.

Otherwise the system holds/isolates the affected path and uses a forward fix or restore procedure.
