# PROD-00 Q3 — Red Proof

## Baseline red proof

At `main@34eb60b9bcc076aa2be49c9ed9b1b38091135734`, hosted run `33978141856` demonstrated two executable native CI failures while the root `verify` job passed:

- iOS: CI requested scheme `ViraIOS` while the Swift package scheme is `ViraNative`;
- Android: Gradle task validation rejected a generated-source consumer without a declared producer dependency.

## Repair attempts retained as negative proof

### Attempt 1 — `f59216bc185c32e679722db0660e912324041807`

PR run `33979374589`:

- `ios-native`: **PASS** — confirms the scheme drift diagnosis and minimal `ViraNative` workflow fix;
- `android-native`: **FAIL** — source-set `TaskProvider` registration did not establish the required producer relation for all AGP consumers.

### Attempt 2 — `d9bd041c1b59fc727d73a5a6a3ffd3644af76c4a`

PR run `33979489885`:

- `android-native`: **FAIL** — explicit annotation-extraction `dependsOn` still left the build dependent on consumer task names rather than the generated-source ownership API.

### Attempt 3 — `5e36736879cf248cd6a25d08535549fdbe83b3a5`

PR run `33979690913` moved the generator to a typed Gradle task plus AGP Variant API. The build still failed during Kotlin build-script compilation because the generic callback type did not expose the legacy unit-test accessor.

### Diagnostic capture — run `33979789606`

A temporary fail-only PR diagnostic captured the exact script errors without suppressing Gradle validation:

```text
Unresolved reference 'unitTest'
Unresolved reference 'sources'
Unresolved reference 'addGeneratedSourceDirectory'
```

The temporary diagnostic write permission/comment step was removed immediately after capture.

### Attempt 4 — `1a5d9cbb1234296a391c1a94f793054759454be8`

PR run `33980682503` proved two important repairs on one head:

- `ios-native`: **PASS**;
- frozen workspace install: **PASS**;
- `android-native`: **FAIL** during Kotlin build-script compilation because even an explicit `LibraryVariant` cast did not expose `unitTest` on the actual AGP 9.4.0 script classpath.

The correction therefore stopped relying on that direct accessor and moved JVM unit-test generated-source registration to `Variant.nestedComponents -> HostTest -> sources.kotlin`.

### Attempt 5 — `e16af523b2597e36d3d11c8e331488d76a674ea1`

PR run `33980885991` proves the Android build-graph repair itself is effective:

- `generatePackagedMainSources`: executed;
- `extractDebugAnnotations`: completed without Gradle producer-validation failure;
- `generatePackagedTestSources`: executed;
- Kotlin script configuration: completed;
- Android reached the real `compileDebugKotlin` task.

The remaining failure moved into checked-in Kotlin source compatibility:

```text
ViraAndroidIssue.kt: 'message' hides member of supertype 'Throwable' and needs an 'override' modifier
ViraAndroidRuntime.kt: Only safe or non-null asserted calls are allowed on a nullable receiver of type 'ViraJson?'
```

The source correction is intentionally semantics-preserving: `ViraAndroidIssue.message` explicitly overrides `Throwable.message`, and `scopeValue` narrows the already-validated non-null input into a non-null `ViraJson` local before traversal.

The failures are intentionally retained as red proof. Gradle validation remains enabled.

## Root-cause correction

The Android module uses AGP `9.4.0`, where built-in Kotlin is active. Task-generated Kotlin sources must preserve an explicit producer relationship instead of being materialized as unowned source paths.

The generator is modeled as a typed Gradle task with an `@OutputDirectory`. Main generated Kotlin is registered through `variant.sources.kotlin.addGeneratedSourceDirectory(...)`. The JVM unit-test generated source is registered through the unit-test `HostTest` in `variant.nestedComponents`, whose inherited `sources` API provides the same generated-directory producer wiring.

This avoids both failure modes already disproved above:

- no plain generated-directory path that loses task ownership;
- no consumer-task-name `dependsOn` list.

References:

- `https://developer.android.com/build/migrate-to-built-in-kotlin`
- `https://developer.android.com/reference/tools/gradle-api/9.4/com/android/build/api/variant/Variant`
- `https://developer.android.com/reference/tools/gradle-api/9.4/com/android/build/api/variant/HostTest`
- `https://developer.android.com/reference/tools/gradle-api/9.4/com/android/build/api/variant/SourceDirectories`

## Structural red-gate status after Q4 repairs

- workspace lockfile: **CLOSED** — real `pnpm-lock.yaml` is committed;
- frozen install: **CLOSED** — hosted CI uses `pnpm install --frozen-lockfile`;
- competing roadmap: **CLOSED** — PR #214 is closed unmerged and retained scope is deferred to PROD-20;
- live `main` protection: **OPEN** — Q9 still requires repository-admin proof of PR-only protection, required healthy checks and no ordinary-developer bypass.

Q3 does not claim phase completion. It proves the release gates fail closed for the defects PROD-00 is required to remove.
