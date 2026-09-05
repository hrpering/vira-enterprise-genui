# MASTER-47 — Q8 Attempt 2

**Date:** 2026-09-05  
**PR:** #208  
**Reviewed freeze entering attempt:** `b42ae481700094f118328f111f8011ab44136877`  
**Result:** FAIL — executable owner drift found and remediated

## Finding

After the first Q8 remediation unified exact-reference parsing, the restarted independent review found a second canonical-owner duplication: `commercial-settlement` independently validated exact Application `applicationId + applicationVersion` using its own namespaced-id checks and `RELEASE_VERSION` semver regex in both schedule and persisted allocation-evidence parsing.

Application release identity/version semantics are canonically owned by `application-package`. The package root parser also validated those semantics independently, so downstream settlement and the package root could drift from one another.

## Remediation

`application-package` now exposes owner-local canonical:

```text
parseViraApplicationReleaseReference
serializeViraApplicationReleaseReference
```

The canonical parser owns:

- namespaced exact Application id semantics;
- exact release semver syntax;
- bounded version length;
- exact-object safe parsing;
- frozen canonical output and deterministic serialization.

`parseViraApplicationPackage` delegates its root Application id/version validation to that owner API and only remaps contextual package paths.

`commercial-settlement` schedule parsing and allocation-evidence parsing delegate Application release identity/version validation to the same owner API. Their local `RELEASE_VERSION` implementation was removed.

Focused `application-release-reference.test.ts` coverage protects direct-owner ↔ Application-package ↔ settlement-schedule acceptance parity, nested package error paths, serialization/freeze and unsafe-object rejection.

## New executable freeze

`95c9a0674742c702cc5265b8e1fb35f82dea04ad`

The operator-reported Q7 PASS on `b42ae481700094f118328f111f8011ab44136877` is historical only and invalidated for final merge because executable/test files changed after that run.

Final Q8 cannot PASS until the full local Q7 command set is rerun detached at the new exact freeze, including the new Application release-reference suite, and the independent Q8 review is restarted again.
