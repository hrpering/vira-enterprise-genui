# Live Release Gate Blockers

**Program status:** CODE/CI IMPLEMENTATION ACTIVE / LIVE PRODUCTION MUTATIONS OUT OF SCOPE

These gates are intentionally deferred. Their absence does not block provisional code merges, but it blocks production-authoritative Q9, release tags, `VIRA PRODUCTION MVP RC` and `VIRA FULL PLATFORM RC`.

## Repository governance

- Protect `main` with PR-only merge and required `verify`, `ios-native`, `android-native` checks.
- Prove ordinary developers cannot bypass required checks.

## Vercel and Railway

- Run exact deployment-ID correlated Vercel preview/production smoke.
- Run Railway API/worker staging smoke, restart and rollback against immutable deployment UUID/image digest.
- Prove browser-to-BFF-to-Railway identity, CSRF and server-to-server authentication in deployed environments.

## Data, recovery and release validation

- Execute real PostgreSQL backup/restore and migration rollback rehearsal in an isolated production-like environment.
- Verify object-store retention/deletion, KMS rotation/revocation and secret-provider recovery.
- Complete design-partner UAT, support rehearsal, SLO burn-rate, load/soak and alert-delivery evidence.
- Complete production device/external-host matrix and cross-device recovery evidence.

Every activated item records owner, environment, exact artifact SHA/digest, timestamp and immutable evidence reference.
