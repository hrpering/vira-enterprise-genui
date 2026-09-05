# PROD-05 Q8 — Independent Re-audit

## Finding

The first independent pass identified a fail-closed gap at the deployment persistence boundary: `sameStoredArtifact()` compared only a subset of metadata, so an injected/corrupted store could return a valid signed artifact paired with a mutated persisted release record.

## Red proof

Commit `71f823ec9720f00771a5d5d4f683b214cc2e6ca7` added a custom-store adversarial test that changes persisted release version while retaining the authenticated signed artifact. Hosted CI #1806 behaved as required for a red proof:

- `ios-native` — PASS
- `android-native` — PASS
- `verify` — FAIL specifically at `Verify repository and browser gates`

This isolated the failure to the new regression test rather than runner/bootstrap/native infrastructure.

## Remediation

Commit `07fa3aab23e89e220b2b181d59029f5b59c3c276` hardened canonical equality between persisted records and the reverified signed source. Commit `5a16553df2a8f3e959a4c036fffa0e83d54793a1` added a second adversarial case proving a mutated `registerArtifact()` result is rejected before a deployment commit.

Hosted CI #1808 then passed `verify`, `ios-native`, and `android-native` on exact executable SHA `5a16553...`.

## Review result

No additional executable defect was identified in the re-read of deployment-plane ownership, persistence adapter boundary, resolver revalidation, exact release/scope checks, promotion/rollback/deprecation behavior, or current PR review/thread state. PROD-05 is source/CI frozen through Q8.
