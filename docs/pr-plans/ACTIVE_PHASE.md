# Active Phase

**Phase:** PROD-00 — Program, owner, threat and operations freeze  
**Status:** Q0–Q6 COMPLETE; Q7 EXACT-HEAD VERIFICATION IN PROGRESS; Q9 BLOCKED ON LIVE `main` PROTECTION  
**Authoritative base main:** `34eb60b9bcc076aa2be49c9ed9b1b38091135734`  
**Branch:** `prod/00-program-freeze`  
**Roadmap:** `docs/production/VIRA_UNIFIED_ARCHITECTURE_PRODUCTION_PLAN_FINAL.md`  
**Previous program:** MASTER-26..51 Application Network — CLOSED

## Goal

Activate the single `PROD-00..PROD-22` production dependency graph without reopening the closed Application Network program or creating parallel semantic authorities.

PROD-00 is a program/governance and release-foundation phase. It may change CI/build/governance configuration needed to restore trustworthy release gates, but it does not authorize production runtime domain implementation.

## Q0 baseline

- latest verified `main` at activation: `34eb60b9bcc076aa2be49c9ed9b1b38091135734`;
- `main` branch protection: disabled at activation;
- root hosted `verify` job: PASS on run `33978141856`;
- `ios-native`: FAIL because CI selected `ViraIOS` while the Swift package scheme reported by Xcode was `ViraNative`;
- `android-native`: FAIL because generated source consumers did not carry a declared producer dependency;
- `pnpm-lock.yaml`: absent;
- CI dependency install: `pnpm install --no-frozen-lockfile`;
- draft PR #214 was a competing MASTER-52 Machine Commerce roadmap and required reconciliation into deferred PROD-20 scope.

## Completed through Q6

1. One `PROD-00..PROD-22` roadmap is active; PR #214 is closed unmerged and its retained scope is deferred to `PROD-20`.
2. Current/future semantic ownership and dependency permissions are frozen in the production owner matrix.
3. Employee offboarding is frozen as the GitHub + Google Workspace reference Application.
4. Vendor/region, security/data, SLO/RPO/RTO/incident/support and release/migration/rollback/flag decisions are recorded in PROD-00 ADRs.
5. iOS CI targets the actual `ViraNative` scheme.
6. Android generated Kotlin ownership uses a typed task plus AGP Variant API producer wiring; Gradle validation stays enabled.
7. The generated workspace `pnpm-lock.yaml` is committed and hosted CI uses `pnpm install --frozen-lockfile`.
8. Temporary lockfile/diagnostic write permissions are absent; final CI is repository read-only.
9. `verify:plan-coherence` fails closed on competing active-roadmap drift.
10. Q5 security and Q6 architecture reviews are recorded under `docs/evidence/PROD-00/`.

## Current exact-head gates

Q7 must pass on one exact PR head for repository/browser, iOS and Android hosted checks. Q8 then re-reads the final source/configuration and live repository state from zero.

The remaining administrative blocker is live GitHub `main` protection: PR-only merge, required healthy checks and no ordinary-developer bypass must be proven from repository settings before Q9. Source files cannot substitute for that proof.

## Freeze rule

Any executable/config/test/source change after Q7 invalidates the Q7 freeze. A Q8 finding that changes executable content requires Q5/Q6 and Q7 again before Q8 restarts from zero.

PROD-01 may not treat PROD-00 outputs as production dependencies until Q9 closes this phase on the exact PR head.
