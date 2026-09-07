# PROD-00 Q1 — Reverse Engineering

## Nearest authorities

- roadmap activation: `MASTER_PLAN.md`, `docs/pr-plans/ACTIVE_PHASE.md`;
- executable package dependency authority: `tooling/package-boundaries.config.mjs`;
- semantic owner explanation: `PACKAGE_OWNERSHIP.md`;
- CI authority: `.github/workflows/ci.yml`;
- Swift package identity: `Package.swift`;
- Android generated source/build graph: `sdk/android/vira-android/build.gradle.kts`.

## Findings

1. Application Network MASTER-26..51 is closed and must not be reopened.
2. Final/V6 already defines the sole successor graph as PROD-00..22, with PROD-17 and PROD-22 release cut-lines.
3. Draft PR #214 is planning work, not production authority. Its reusable Machine Commerce semantics belong under deferred PROD-20.
4. The iOS failure is a workflow selection defect: product/target name `ViraIOS` is not evidence of an Xcode scheme named `ViraIOS`; package scheme authority is `ViraNative`.
5. The Android failure comes from losing Gradle's producer relationship by materializing generated output as a plain path in the source set. The minimal repair is to attach the generating TaskProvider as the source directory producer rather than adding an unrelated blanket task dependency.
6. Lockfile absence means CI cannot yet be switched safely to frozen install. The lockfile must be generated from the complete workspace and committed first.
7. Branch protection is an administrative repository state, not a docs flag. Q9 requires live GitHub protection/ruleset evidence.
8. PROD-00 must not introduce any of the future semantic owners (`application-runtime`, `provider-connection`, `action-transaction`, etc.); those belong to their dependency phases after Q9.

## Failure behavior

- Wrong/unknown native scheme must fail CI; CI must not silently skip iOS.
- Generated Android sources must have declared producer relationships; Gradle validation must stay enabled.
- Missing/outdated lockfile must fail once frozen install is activated.
- Unprotected `main` or missing required checks blocks Q9.
- A second active roadmap blocks plan coherence.

## Q1 result

**PASS for reverse-engineering entry.** Q2 operational/vendor/security freeze and remaining PROD-00 implementation are still open.
