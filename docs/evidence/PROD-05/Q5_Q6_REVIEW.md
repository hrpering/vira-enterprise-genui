# PROD-05 Q5/Q6 — Security and Architecture Review

## Security

- Exact `ApplicationReleaseReference` is required; floating `latest` is rejected by the canonical release parser.
- Distribution integrity, publisher provenance and release signature are verified before publication and revalidated for cached resolution.
- Environment binding is exact tenant/project/environment scope and requires trusted status; secret material is represented only by `secretRef`.
- Promotion is adjacent `dev -> staging -> production` and must preserve the same immutable release/digest lineage.
- Rollback targets historical state in the same enterprise scope and does not mutate release identity.
- PostgreSQL persistence is tenant-scoped and the deployment plane fails closed on store conflicts.

## Q8 hardening incorporated

The re-audit proved the persistence port itself must be treated as an untrusted boundary. The plane now requires the stored artifact record to exactly match the authenticated signed source across artifact kind/id, release, digest, publisher, canonical distribution, provenance/principal, signature and status. A mutated `registerArtifact()` result is rejected before `commitDeployment()`.

## Architecture

- `deployment-plane` remains the publication/deployment owner.
- `application-resolution` consumes deployment-plane source operations and emits an immutable canonical resolution artifact/digest; it does not own deployment state.
- `integrations/postgres` implements the deployment state-store port rather than defining parallel semantics.
- No provider secret value is introduced into Application resolution artifacts.

No unresolved inline review thread or submitted review was present on PR #220 at the Q8 re-audit point.
