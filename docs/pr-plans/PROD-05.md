# PROD-05 — Authenticated Application Deployment and Resolution

**Status:** SOURCE/CI FROZEN THROUGH Q8; Q9 PROVISIONAL BLOCKED  
**PR:** #220  
**Branch:** `prod/05-authenticated-application-deployment-resolution`  
**Stacked base:** `prod/05-dependency-join@29754756b6a2b62318edab8db164d5eb98b02267`  
**Executable freeze:** `5a16553df2a8f3e959a4c036fffa0e83d54793a1`  
**Hosted CI:** run `33998847814` / #1808 — `verify`, `ios-native`, `android-native` PASS

## Goal

Allow only authenticated, exact, immutable active Application releases to be deployed and resolved inside an exact enterprise environment scope.

## Owned changes

- `deployment-plane`: authenticated `application-distribution` deployment, environment binding, promote/rollback/deprecate, durable store port.
- `integrations/postgres`: tenant-scoped Application deployment persistence and migration.
- `application-resolution`: exact active release resolution with current trust revalidation and deterministic resolution digest.

No new deployment semantic owner is introduced.

## Q8 remediation

Independent re-audit found that a custom/corrupted persistence adapter could pair a valid signed artifact with a mutated persisted artifact record because the deployment plane compared only a subset of identity metadata. Red proof `71f823ec9720f00771a5d5d4f683b214cc2e6ca7` failed hosted CI #1806 at the repository/browser gate while both native jobs remained green.

The remediation at `07fa3aab23e89e220b2b181d59029f5b59c3c276` canonicalizes and compares the persisted distribution plus release, artifact kind/id, digest, publisher provenance, principal, signature and status against the reverified signed source. Publish now also rejects a mutated `registerArtifact()` return before any deployment commit. Coverage was extended at `5a16553df2a8f3e959a4c036fffa0e83d54793a1` for both cached-read and registration mutation paths.

## Q9 block

Do not merge this PR yet. PROD-00/PROD-01 production-authority gates remain provisional, including the deliberately deferred live `main` protection/required-check proof and external production-shell smoke evidence. This phase is suitable as the parent of further provisional stacked work, not yet as production authority.
