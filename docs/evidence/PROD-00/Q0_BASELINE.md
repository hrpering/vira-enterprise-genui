# PROD-00 Q0 — Baseline

**Observed:** 2026-09-05  
**Authoritative base:** `main@34eb60b9bcc076aa2be49c9ed9b1b38091135734`

## Repository state

- default branch: `main`;
- branch protection: disabled (`protected=false`, required status enforcement off);
- production roadmap file already present: `docs/production/VIRA_UNIFIED_ARCHITECTURE_PRODUCTION_PLAN_FINAL.md`;
- prior Application Network active-phase record is CLOSED;
- draft PR #214 is open on `master/52-machine-commerce-semantics-freeze` and therefore conflicts with the single-roadmap rule until reconciled;
- `pnpm-lock.yaml` is not present on `main`;
- CI install remains `pnpm install --no-frozen-lockfile`.

## Hosted CI baseline

Workflow run `33978141856` on exact base SHA started real hosted runners and completed all three jobs:

| Job | Result | Baseline interpretation |
|---|---|---|
| `verify` | PASS | repository/browser/portable gates are healthy on the base |
| `ios-native` | FAIL | executable workflow/scheme drift; not an environment-only failure |
| `android-native` | FAIL | executable Gradle task-graph drift; not an environment-only failure |

### iOS defect

`Package.swift` declares package name `ViraNative`; Xcode reports that package scheme while CI calls `xcodebuild ... -scheme ViraIOS`.

### Android defect

`generatePackagedMainSources` owns generated Kotlin output, but `sourceSets.main.kotlin` is currently populated with the output path as a plain directory. Gradle therefore cannot infer the producer relationship for every consumer such as annotation extraction.

## Q0 result

**PASS as a baseline gate.** The current truth and blockers are concrete enough to enter Q1/Q2. This is not a release PASS and does not authorize PROD-01.
