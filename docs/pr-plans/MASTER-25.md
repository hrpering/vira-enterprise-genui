# MASTER-25 — Enterprise RC Gate

Status: CODE-COMPLETE / USER-FINAL-CI-REQUIRED after phase review.

## Goal

Provide one fail-closed local release-candidate command over the exact stacked checkout. The gate may report PASS only when repository/browser checks, portable native conformance, real iOS Simulator execution, real Android Emulator execution and the required external brand proof evidence all pass. For MASTER-23 acceptance, that external evidence is produced by the Pegasus proof repository; the core RC interface remains domain-neutral.

## Command

```bash
VIRA_EXTERNAL_BRAND_PROOF_EVIDENCE=/absolute/path/to/external-brand-proof.json pnpm verify:enterprise-rc
```

## Gate order

```text
repo + browser
      ↓
portable native wire conformance
      ↓
iOS Simulator tests
      ↓
Android Emulator instrumentation
      ↓
external brand proof evidence
      ↓
RC PASS
```

## Invariants

- `pnpm verify:enterprise-rc` is the only command allowed to print Enterprise RC PASS.
- Missing Xcode/iPhone Simulator fails closed; host Swift tests are not a substitute.
- Missing Android Emulator, adb or Gradle fails closed; JVM unit tests are not a substitute.
- Android instrumentation executes inside an actual connected emulator and proves the public external-brand Android surface is loadable there.
- iOS uses an available real iPhone Simulator device and runs the exported `ViraIOS` product scheme tests via `xcodebuild`.
- The iOS runner validates that `ViraIOS` is present in `xcodebuild -list -json` before attempting simulator execution.
- MASTER-02 native wire conformance remains a separate gate and is not mislabeled simulator/emulator execution.
- External brand evidence is mandatory and must bind to the exact current Git HEAD; MASTER-23 requires that evidence to come from the external Pegasus proof repository.
- Evidence must bind one exact Pack id/version/digest and passing Web/iOS/Android trace references.
- Evidence must prove Action Boundary, governance/approval, observability/ledger, cross-platform conformance, accessibility/localization, reconnect/cache and all required negative cases.
- A stale external proof from another stack head fails closed.
- MASTER-24 second-brand proof is included through the normal repository test suite.
- MASTER-23 extraction regression is included through the normal repository test suite.
- The root package and core runtime interfaces remain domain-neutral; external proof identity does not become a core script or API name.
- This phase does not run CI on behalf of the repository owner; the owner performs the final exact local gate.

## Required local prerequisites

- Node >= 24 and pnpm 11.24.0
- Playwright Chromium installed for the Studio browser gate
- macOS + Xcode + at least one installed iPhone Simulator runtime
- Android SDK/platform-tools, a booted Android Emulator, Android API 36/build-tools 36.0.0 and Gradle 9.6+
- external Pegasus proof evidence JSON produced against the exact current checkout and supplied through the generic external-brand evidence input

Only after the exact current checkout passes `pnpm verify:enterprise-rc` may the stack be called **Vira Enterprise GenUI / Governed Experience Platform RC1**.
