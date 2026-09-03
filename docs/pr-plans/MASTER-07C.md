# MASTER-07C — Android Native SDK — PR Plan

## 1. Authoritative base

This phase starts only from authoritative `main`:

`7a1203a909afb38416143abdfa125a4c58237b0d`

Branch:

`master/07c-android-native-sdk`

This plan file is the first branch commit. No older Android/native branch is merged or replayed blindly.

## 2. Architectural responsibility

MASTER-07C owns one responsibility:

> Provide the first native Android Host SDK that consumes the same canonical Vira Experience, Brand, Host Capability, exact-instance resolution and platform-neutral Runtime Core/session semantics as Web and iOS, while rendering through trusted local Kotlin/Android implementations rather than introducing a second semantic model.

Android is a platform adapter. It is not a second Experience, Brand, resolver, policy, Runtime Core, publication or protected-action authority.

## 3. Frozen upstream authorities

MASTER-07C consumes rather than duplicates:

- canonical Experience semantics/publication → `studio-schema` / Studio publication path;
- generated portable Experience artifacts → `interop/studio-experience/v1`;
- generated Kotlin wire model → `interop/studio-experience/v1/kotlin/StudioExperienceModels.kt`;
- Brand/component/platform implementation mapping → MASTER-03 `studio-brand`;
- Host Capability Manifest/compatibility → MASTER-04 `studio-host`;
- exact deployment/Pack/publication/instance resolution → MASTER-05 `experience-resolver`;
- Runtime Core/session semantics → MASTER-06;
- reference Web Host composition → MASTER-07A;
- native trust-boundary and lifecycle lessons → MASTER-07B iOS;
- protected side-effect execution/approval → future MASTER-08.

Generated Kotlin wire code remains generated and must not be hand-edited.

## 4. Global invariants

1. One canonical Experience model across web, iOS and Android.
2. No Android-only Experience schema or semantic component fork.
3. Kotlin generated models are structural wire representations, not publication authority.
4. Exact `instanceId`; no latest/current/active/global client routing.
5. Exact Host Capability support; no wildcard/prefix/closest-match fallback.
6. Brand `android` implementation IDs resolve only to trusted locally installed Android implementations.
7. No remote dex/jar/apk/code/class/module/HTML/JavaScript executable mechanism as the Experience runtime.
8. No reflection/class loading from untrusted implementation IDs.
9. Android lifecycle/network signals translate into MASTER-06 semantics rather than redefining them.
10. Reconnect/resume never replays protected actions.
11. Capability support does not grant authorization.
12. Exact Runtime Core built-ins remain local; ordinary actions remain on the Host path.
13. Raw secrets never enter Experience/native renderer/restorable client state.
14. Generic SDK contains no customer/domain switch.
15. Unsupported/malformed inputs fail closed.
16. Defensive Android validators may reject forged/non-canonical input but must not become a second Studio compiler/publication authority.

## 5. Reverse engineering findings before implementation

### 5.1 Kotlin portable artifact

Current repo already contains generated Kotlin Experience wire code:

`interop/studio-experience/v1/kotlin/StudioExperienceModels.kt`

It is generated from `packages/studio-schema/src/types.ts` and explicitly marked `GENERATED FILE. DO NOT EDIT.`

Therefore MASTER-07C must consume this artifact rather than recreating document/view/node/binding/interaction models.

### 5.2 Current Kotlin verification is not an Android SDK gate

Current `tooling/check-studio-native-conformance.mjs` compiles the generated Kotlin model plus `Conformance.kt` using `kotlinc`, then runs the resulting JVM jar.

That proves portable structural Kotlin conformance only.

It does not prove:

- Android Gradle plugin compatibility;
- Android SDK compilation;
- Android lifecycle classes;
- Compose/View renderer source compilation;
- Android-specific resource/classpath ownership;
- Android unit tests.

MASTER-07C therefore requires a real Gradle Android library build/test gate in CI in addition to the existing JVM conformance gate.

### 5.3 No existing Android SDK owner

At phase start there is no repository-owned Android Gradle module / `sdk/android` implementation. The SDK package/module must therefore be introduced explicitly without moving generated Kotlin wire authority into handwritten source.

### 5.4 iOS parity is behavioral, not source-copy parity

MASTER-07B provides useful trust and runtime invariants but UIKit/Swift-specific code must not be ported mechanically.

Android should mirror semantics for:

- exact mount identity;
- Host snapshots and monotonic revisions;
- canonical JSON validation;
- defensive graph/projection integrity;
- source catalog enforcement;
- Runtime Core built-ins;
- repeated runtime-node identity;
- stale renderer invalidation;
- lifecycle/session translation;
- deterministic teardown;

while owning Android-specific rendering/lifecycle through Android-native abstractions.

## 6. Target package ownership

Expected structure after RE:

```text
sdk/android/
  settings.gradle.kts / build.gradle.kts as required
  vira-android/
    build.gradle.kts
    src/main/kotlin/...      handwritten Android Host SDK
    src/test/kotlin/...      JVM/local tests where appropriate
    src/androidTest/...      only if instrumentation is materially required
```

Generated Experience Kotlin remains under:

```text
interop/studio-experience/v1/kotlin/
```

The Android module may compile/include the generated source through an explicit source-set or generation/copy verification step, but must not fork or edit it.

Prefer the smallest Gradle structure that gives a real Android library compiler/test gate.

## 7. Native mount projection

Add a canonical TypeScript Android mount-envelope projection adjacent to the iOS projection rather than inventing Android backend resolution.

Required semantics:

- versioned mount envelope;
- exact instance/deployment/Pack/publication artifact identity;
- compatibility Host id;
- platform exactly `android`;
- exact implementation IDs/capabilities;
- Brand Android component implementations;
- bounded source catalog projection;
- canonical Studio Experience document;
- no secret or executable metadata.

The producer must only emit after canonical resolver/Host/Brand/publication checks.

## 8. Kotlin native trust boundary

Android decode/validation must fail closed for forged/untrusted serialized envelope data before trusted renderers receive it.

Defensive validation should mirror canonical limits/semantics proven in 07B where relevant:

- unknown/invalid envelope identity;
- platform/Host mismatch;
- unsupported implementation IDs;
- duplicate/missing/cyclic graph identity;
- canonical view/node/binding/interaction resource bounds;
- static prop definitions/types/requiredness;
- static + bound source conflicts;
- source catalog identity/type/scope rules;
- repeat source registration/array type;
- event payload key/required/type/source validation;
- route target existence and duplicate outcomes;
- canonical JSON finite-number/resource constraints.

This validation is reject-only and must not become publication compilation authority.

## 9. Runtime Core semantics

Android must preserve Runtime Core semantics already established across Web/iOS.

Exact local built-ins:

- `runtime.patch.apply`
- `runtime.lifecycle.transition`

Rules:

- permission decision happens before reduction/Host dispatch;
- exact built-ins are reduced locally;
- malformed built-in payload fails closed;
- exact built-ins never cross the business Host boundary;
- arbitrary `runtime.*` prefix is not blanket-rejected;
- non-built-in canonical actions use the normal Host path;
- deny/confirm never auto-execute.

## 10. Host adapter

Define a trusted Android Host bridge/adapter with:

- exact semantic Host id/version;
- canonical snapshot state/domain values;
- monotonic non-negative safe revision;
- action dispatch;
- subscription + deterministic unsubscribe;
- stale action-response snapshot isolation;
- subscription regressions fail closed;
- outbound action payload canonical-JSON validation before the bridge.

No endpoints, credentials or network client are built into the generic SDK.

## 11. Renderer registry

Trusted local registry shape conceptually:

```text
android implementationId -> native renderer/factory
```

Rules:

- exact ID only;
- implementation ID must be declared by Brand and supported by Host Manifest;
- no wildcard/prefix/fallback;
- no class-name guessing;
- no `Class.forName` from untrusted strings;
- no remote dex/jar download;
- missing renderer fails closed.

## 12. Android UI owner

Prefer a small native rendering abstraction that can be backed by Compose and/or Android Views without introducing a second virtual-DOM/runtime model.

Initial reference surface should be chosen based on build/test simplicity and native host ergonomics.

The renderer receives only canonical runtime-node data and a bounded event emitter. It does not own routing, policy, backend execution or Experience semantics.

Retained emitters must be invalidated by exact view generation and Host revision so stale UI cannot dispatch against a newer surface.

## 13. Lifecycle mapping

Map trusted Android lifecycle sources into MASTER-06 semantics, including as applicable:

- foreground/resume;
- background;
- disconnect/reconnect;
- explicit teardown.

Do not guess network state inside the generic runtime if the Host has not supplied a trusted connectivity source.

Rules:

- duplicate lifecycle signals are deterministic no-ops;
- disposed sessions stop receiving events;
- reconnect/resume never replays protected actions;
- restoration remains exact-instance-bound;
- restored cache/artifact state remains verification-required unless canonical verification authority says otherwise.

## 14. Resource/DoS bounds

Mirror canonical/native limits required to prevent forged input or nested repeats from causing unbounded CPU/memory/stack use before rendering.

At minimum:

- canonical document graph bounds before traversal;
- repeat item bound;
- cumulative expanded runtime-node bound (`4096`, owned canonically by `studio-runtime`);
- canonical JSON depth/node/string/container budgets;
- bounded Brand components/actions/source catalog/capabilities;
- bounded view-generation/revision counters.

Use iterative graph traversal where practical to avoid stack-risk from forged parent chains.

## 15. Security review

Verify before merge:

- no remote executable loading;
- no reflection/class lookup from untrusted IDs;
- no WebView/HTML fallback as the generic native Experience mechanism;
- no raw secret-bearing state;
- no global/current/latest instance routing;
- no protected-action bypass;
- no action replay on reconnect/resume;
- exact Host/instance/implementation identity;
- canonical JSON rejects non-finite numbers and other unrepresentable values;
- lifecycle/listener cleanup deterministic;
- hostile callbacks/errors normalized without leaking sensitive content;
- no customer/domain branching.

## 16. Verification strategy

### Existing portable verification retained

- generated artifact drift check;
- Kotlin `kotlinc` portable conformance;
- Swift portable/native conformance;
- full repository/browser gates.

### New Android executable SDK verification

CI must add a real Android job or equivalent deterministic Android Gradle commands that compile/test the handwritten SDK against Android SDK tooling.

Required at minimum:

- Gradle wrapper/checksum or otherwise pinned deterministic Gradle invocation;
- pinned JDK;
- Android SDK/compileSdk availability;
- Android library assemble/compile PASS;
- Android unit tests PASS;
- no generated Kotlin wire drift/hand-edit;
- package boundary checks updated only as necessary.

Do not accept syntax/text checks as a substitute for an Android compiler.

## 17. Focused regression coverage

Cover at minimum:

- valid canonical Android envelope;
- unknown/forged envelope fields rejected;
- platform mismatch rejected;
- unsupported implementation ID rejected;
- generated Kotlin document decoding still canonical;
- duplicate/cyclic/over-limit graphs rejected before runtime expansion;
- source catalog registration/type/scope enforcement;
- static+binding conflict rejection;
- event payload required/key/literal/binding type enforcement;
- nested repeat cumulative 4096 bound;
- non-finite/negative-zero Host values rejected;
- stale action-response snapshot does not poison newer subscription state;
- subscription revision regression poisons fail closed;
- exact Runtime Core patch/lifecycle reduce locally;
- malformed Runtime Core built-in fails before Host;
- ordinary `runtime.*` action still reaches Host when allowed;
- deny/confirm never reaches Host;
- stale renderer emitter rejected after Host revision change;
- stale renderer emitter rejected after same-view round-trip generation;
- exact repeated runtime-node payload routing;
- lifecycle isolation between simultaneous instances;
- deterministic dispose/unsubscribe;
- reconnect/resume no action replay.

## 18. Independent RE/QC gate

Before squash merge re-check:

- Android is adapter, not semantic owner;
- generated Kotlin model unchanged;
- no duplicate Experience/Brand/Host/Runtime Core model;
- no remote executable/reflection path;
- no hidden/global instance target;
- no action execution bypass;
- no secret-bearing native state;
- exact implementation registry truth;
- deterministic lifecycle teardown;
- Web + iOS behavior remain green;
- all review threads resolved;
- exact-head CI fully successful;
- real Android compiler/test path successful;
- branch 0 behind authoritative `main`;
- final diff phase-scoped.

Only then record `MASTER-07C independent RE/QC: PASS` and squash merge using the verified exact head.

## 19. Explicit non-goals

MASTER-07C does not implement:

- MASTER-08 Action Boundary;
- governance/approval/identity engine;
- publication/deployment control plane;
- secret management;
- remote plugins/dex/jar execution;
- arbitrary HTML/MCP Apps runtime;
- new Experience schema;
- new Brand schema;
- new Host Capability schema;
- new resolver semantics;
- customer-specific Android business logic.

## 20. Acceptance gate

MASTER-07C is complete only when all are true:

1. Android consumes the canonical generated Kotlin Experience contract rather than defining a second schema;
2. platform identity is exactly `android`;
3. exact Brand Android implementation IDs resolve only to trusted local implementations;
4. exact instance/Host identity is preserved across mount/lifecycle/dispose;
5. native lifecycle/connectivity map into MASTER-06 semantics deterministically;
6. exact Runtime Core built-ins reduce locally and ordinary actions preserve canonical Host routing;
7. no protected side-effect bypass or action replay is introduced;
8. no remote executable/reflection mechanism exists;
9. defensive graph/projection/source/event validation fails closed for forged inputs;
10. cumulative repeat/runtime-node and canonical JSON resource limits are enforced;
11. a real Android Gradle compiler/test gate passes;
12. existing Web/iOS/Kotlin/Swift/browser/repository gates remain green;
13. all review findings are resolved;
14. independent architecture/security/API RE/QC passes;
15. branch is 0 behind authoritative main;
16. squash merge uses the verified exact head.
