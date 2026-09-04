# MASTER-07B — iOS Native SDK — PR Plan

## 1. Authoritative base

This phase starts only from authoritative `main`:

`a5fa1c3fff162dbed59bc61ecab803dff5ac4b04`

Branch:

`master/07b-ios-native-sdk`

This plan file is the first branch commit. No older native/iOS branch is merged or replayed blindly.

## 2. Architectural responsibility

MASTER-07B owns one responsibility:

> Provide the first native iOS Host SDK that consumes the same canonical Vira Brand, Host Capability, exact-instance resolution and platform-neutral runtime-session semantics as the reference Web Host, while rendering through trusted local Swift/UIKit/SwiftUI implementations rather than introducing a second Experience/runtime model.

The iOS SDK is a platform adapter over canonical cross-platform contracts. It must not become a second semantic authority.

## 3. Frozen inputs from previous phases

MASTER-07B must consume rather than duplicate:

- canonical Experience semantics and publication model → `studio-schema` / Studio publication path;
- generated portable Experience JSON Schema + Swift wire models → MASTER-02 interop artifacts;
- Brand identity/package/platform implementation mapping → MASTER-03 `studio-brand`;
- Host Capability Manifest and exact compatibility semantics → MASTER-04 `studio-host`;
- exact deployment/Pack/publication/instance resolution semantics → MASTER-05 `experience-resolver`;
- platform-neutral session availability/continuity semantics → MASTER-06 `runtime-core`;
- reference Host composition/trust decisions → MASTER-07A Web Host;
- protected side-effect authorization/execution → future MASTER-08 Action Boundary.

## 4. Global invariants

MASTER-07B preserves all of the following:

1. One canonical Experience model across web/iOS/Android.
2. No iOS-only Experience schema or semantic component fork.
3. Swift interop models are structural/wire representations, not publication authority.
4. Exact `instanceId`; no current/latest/active/global instance routing.
5. Exact Host Capability support; no closest-match, wildcard, prefix or implicit fallback.
6. Brand `ios` implementation IDs resolve only to trusted locally installed native implementations.
7. No remote Swift code, dylib, framework URL, JavaScript bundle, HTML payload or dynamic executable download as the native Experience mechanism.
8. Native lifecycle signals translate into MASTER-06 platform-neutral session semantics rather than redefining them.
9. Reconnect/resume never replays protected actions.
10. Component interactions emit canonical semantic actions; protected side effects remain future MASTER-08 responsibility.
11. Capability support does not grant authorization.
12. Host identity, runtime/business-host identity and exact Experience instance identity remain explicit and distinct.
13. Raw secrets never enter Experience documents, native renderer metadata or client-restorable state.
14. Generic native code contains no customer/domain switch.
15. Unsupported or malformed inputs fail closed.
16. No dependency/ownership edge is added without explicit justification.

## 5. Required reverse engineering before implementation

Implementation starts only after mapping the current native/portable surface.

### 5.1 MASTER-02 Swift interop artifacts

Inspect:

- generated Swift Experience wire models;
- generation source and source digest;
- Swift decoder/unknown-field behavior;
- semantic-negative fixtures;
- current Swift compile/run conformance harness;
- any Foundation-only assumptions;
- whether generated models are suitable as SDK-internal transport types or should remain an interop boundary only.

Determine exactly what MASTER-02 already guarantees and what it intentionally does not guarantee.

### 5.2 Host Capability contract

Inspect MASTER-04 `StudioHostCapabilityManifest` and compatibility evaluator.

Determine the smallest native bridge required to represent an iOS Host Manifest without creating a Swift-owned semantic variant.

Expected platform identity is exactly:

`ios`

The SDK must not infer iOS support from web/Android declarations.

### 5.3 Exact-instance resolver boundary

Inspect MASTER-05 resolver types and resolution output.

Determine how an iOS host should receive an already resolved, verified exact instance without porting arbitrary backend/deployment resolution logic into the client.

Questions to resolve:

- which resolver result fields are required on device;
- what exact immutable descriptor should cross the client boundary;
- how Host Capability identity remains bound to that result;
- how release/dispose ownership is represented natively;
- whether a platform-neutral serialized resolved descriptor exists or must be introduced in the canonical owner rather than inside the iOS SDK.

Do not invent client-side `latest` or deployment lookup.

### 5.4 Runtime kernel boundary

Inspect MASTER-06 session state/event APIs.

Determine how much of `runtime-core` semantics are already portable through generated contracts versus TypeScript-only implementation.

The iOS SDK must preserve the same semantic state machine, but must not copy TypeScript logic ad hoc if a generated/shared conformance source can own it.

If a native runtime/session kernel is required, first determine whether it belongs in generated interop/conformance artifacts or a new explicit native SDK package structure.

### 5.5 Existing execution/runtime semantics

Inspect:

- `studio-runtime`;
- `studio-host-runtime`;
- `studio-runtime-react` only as behavioral reference;
- semantic action routing;
- binding evaluation;
- interaction routing;
- permission/action boundaries.

Separate:

- cross-platform semantic behavior that iOS must match;
- web/React rendering implementation that must not be ported;
- future Action Boundary behavior that must not be implemented early.

### 5.6 Native renderer registry

Map MASTER-03 component implementation entries:

```text
component
web
ios
android
```

For iOS, determine a trusted local registry shape such as conceptual:

```swift
implementationId -> native renderer/factory
```

Rules:

- exact ID only;
- registry truth must match Host Manifest support;
- local executable objects are not serialized into manifests;
- missing implementation fails closed;
- no URL/path/module-name guessing;
- no reflection-based arbitrary class loading from untrusted strings.

### 5.7 Native UI owner

Determine whether first implementation should target:

- SwiftUI;
- UIKit;
- a thin abstraction supporting both;
- or one reference renderer surface with an explicit future adapter.

Choose the smallest design that preserves native UI and does not force a web-style virtual DOM model into iOS.

The decision must be based on current repository constraints and testability, not preference alone.

### 5.8 Native lifecycle mapping

Map iOS host lifecycle sources to MASTER-06 semantics, including as applicable:

- foreground/background transitions;
- scene/application activation;
- connectivity reachability signal;
- reconnect;
- memory-driven view destruction/recreation where relevant.

Rules:

- lifecycle source is an adapter only;
- duplicate signals inherit deterministic no-op semantics;
- listener teardown is deterministic;
- disposed instances stop receiving lifecycle events;
- lifecycle restoration does not imply verified artifact/cache authority;
- reconnect/resume performs no action replay.

## 6. Expected target architecture

Conceptually:

```text
Canonical resolved Experience instance
        +
Vira Brand ios implementation IDs
        +
iOS Host Capability Manifest
        +
Trusted local iOS renderer registry
        +
Platform-neutral session semantics
        ↓
Vira iOS Host SDK
        ↓
Native component tree / interaction bridge
        ↓
SwiftUI/UIKit host surface
```

Semantic ownership remains upstream of the iOS adapter.

## 7. Package / artifact ownership decision

Do not create package structure before RE.

Possible outcomes to evaluate:

1. extend existing generated `interop/studio-experience/v1/swift` area only for wire/conformance artifacts, while placing executable SDK source under a dedicated native SDK directory;
2. introduce a dedicated `sdk/ios` or equivalent repository-owned Swift package if no current owner exists;
3. extend an existing native package if RE proves one already owns this responsibility.

The final location must:

- avoid mixing generated wire models with handwritten runtime/UI logic without a clear boundary;
- support deterministic generation/conformance checks;
- build with real Swift tooling in CI;
- leave Android symmetry possible without forcing shared platform UI code.

## 8. Native Host Manifest

The iOS Host must report a canonical Host Capability Manifest equivalent to MASTER-04 semantics:

- version `1`;
- semantic Host id;
- platform exactly `ios`;
- exact supported implementation IDs;
- exact supported capabilities.

The manifest must contain no:

- renderer closure;
- UIView/SwiftUI View instance;
- class/metatype pointer;
- URL;
- filesystem path;
- dylib/framework reference;
- secret;
- backend endpoint.

Executable renderer objects remain in a trusted local registry outside the declarative manifest.

## 9. Exact instance / mount contract

The native host API must require explicit exact instance identity.

Conceptually:

```text
host.mount(instanceId: exact, ...)
```

or an equivalent strongly typed API after RE.

It must never route through:

- last mounted instance;
- active singleton;
- current screen;
- global mutable target;
- nearest deployment/version.

Two simultaneous native instances must remain isolated.

## 10. Rendering contract

Native rendering must consume canonical semantic component references and Brand iOS implementation IDs.

Expected trust chain:

```text
canonical component ref
  ↓
validated Brand mapping
  ↓
exact ios implementationId
  ↓
Host Manifest support
  ↓
trusted local native registry
  ↓
native renderer/factory
```

A missing step fails closed.

Native renderers may create platform-native views, but they do not gain authority to redefine:

- Experience semantics;
- action type meaning;
- policy decisions;
- backend execution;
- instance routing.

## 11. Interaction / action contract

User interaction emitted by native components must be translated into the same canonical semantic action/event path as the existing runtime semantics.

MASTER-07B does not create protected side-effect execution.

Until MASTER-08 exists, native SDK behavior must preserve the same boundary as web:

```text
native user interaction
  → canonical semantic action
  → existing trusted host/runtime contract
  ≠ direct arbitrary enterprise side effect
```

No native renderer may receive raw credentials merely because it can emit an action.

## 12. Lifecycle / restoration contract

Expected mapping is to be finalized after RE, but must preserve these semantics:

```text
iOS foreground/active
  → foreground/resume

iOS background/inactive as appropriate
  → background

network unavailable
  → disconnect

network available after disconnect
  → reconnect
```

Restoration rules:

- exact instance identity remains bound;
- session revision remains deterministic;
- restoration cannot silently switch deployment/version;
- cached artifacts remain verification-required unless a canonical verification owner says otherwise;
- no protected action replay.

## 13. Security / trust review

Focused security review must verify:

- no untrusted string becomes a class/metatype/dynamic module load;
- no remote code or arbitrary HTML execution path;
- no raw secret-bearing metadata in native contract/state;
- exact implementation IDs only;
- exact instance routing only;
- unsupported Host Capability fails closed;
- malformed portable Experience fails closed before rendering;
- unknown fields remain fail closed at wire boundaries where MASTER-02 requires it;
- hostile lifecycle/host callbacks cannot escape the SDK contract unexpectedly;
- cleanup failure cannot leak active instance ownership;
- reconnect/resume does not replay actions;
- native renderer errors are normalized without reflecting sensitive thrown content where crossing a trust boundary;
- no customer/domain-specific branching.

## 14. Focused verification

Tests/conformance should cover as applicable after RE:

### Portable contract consumption

- generated Swift models still compile;
- valid canonical fixture decodes;
- semantic-negative/unknown-field fixtures remain rejected as required;
- no separate iOS Experience grammar appears.

### Host capability / renderer registry

- platform exactly `ios`;
- exact supported implementation resolves;
- missing implementation fails closed;
- wildcard/prefix/near-match fails;
- manifest and installed registry remain truthful;
- registry cannot be populated from remote executable metadata.

### Exact instance isolation

- two simultaneous instances remain isolated;
- lifecycle event for A does not mutate B;
- dispose A does not dispose B;
- exact release semantics;
- prototype/dictionary concerns are represented safely in any cross-language map boundary.

### Lifecycle

- initial explicit state;
- foreground/background;
- disconnect/reconnect;
- deterministic duplicate no-op;
- teardown removes listener effects;
- no action replay.

### Native UI

- native renderer receives canonical semantic props/state;
- canonical event bridge emits expected semantic action;
- missing renderer fails closed;
- disposal removes native subscriptions/resources;
- no web/DOM assumption in native core.

### Cross-platform semantic conformance

Use shared fixtures to prove equivalent canonical inputs lead to equivalent semantic runtime/session outcomes between reference web and iOS where platform rendering details are intentionally different.

## 15. Repository verification

Before merge:

- focused MASTER-07B tests PASS;
- Swift package/source builds with real Swift compiler;
- MASTER-02 native portable conformance PASS;
- package/artifact drift checks PASS;
- TypeScript repo gates remain green if tooling/contracts are touched;
- lint/typecheck/full tests/build PASS;
- browser gates remain green;
- `pnpm verify:all` PASS on exact PR head;
- any dedicated iOS build/test command PASS on exact PR head.

CI must run the real native compiler/test path; syntax-only text inspection is not sufficient.

## 16. Independent RE / QC gate

Before squash merge re-check:

- iOS is adapter, not semantic owner;
- no duplicate Experience/Brand/Host Capability/session model;
- no remote executable mechanism;
- no hidden/global instance target;
- no action execution bypass;
- no secret-bearing native state;
- exact implementation registry truth;
- deterministic lifecycle teardown;
- web behavior remains green;
- Android symmetry remains possible without being implemented early;
- domain/customer neutrality preserved;
- all review threads resolved;
- exact-head CI successful;
- branch 0 behind authoritative `main`;
- final diff phase-scoped.

Only then record `MASTER-07B independent RE/QC: PASS` and squash merge using the verified exact head.

## 17. Explicit non-goals

MASTER-07B does not implement:

- Android SDK;
- Action Boundary;
- governance/identity/approval engine;
- publication/deployment control plane;
- secret management;
- arbitrary HTML/MCP Apps compatibility;
- remote plugin execution;
- new Experience schema;
- new Brand schema;
- new Host Capability schema;
- new resolver semantics;
- cross-customer app-specific native logic.

## 18. Acceptance gate

MASTER-07B is complete only when all are true:

1. iOS consumes the canonical portable Experience contract rather than defining a second schema;
2. an iOS Host reports canonical platform `ios` capability metadata;
3. exact Brand iOS implementation IDs resolve only to trusted local native implementations;
4. exact instance identity is preserved across mount/lifecycle/dispose;
5. native lifecycle/connectivity map into MASTER-06 semantics deterministically;
6. user interactions preserve canonical semantic action routing;
7. no protected side-effect bypass is introduced;
8. no remote executable mechanism exists;
9. real Swift build/tests and shared conformance fixtures pass;
10. existing web/native portable/browser gates remain green;
11. independent architecture/security/API RE/QC passes;
12. all review findings are resolved;
13. branch is 0 behind authoritative main;
14. squash merge uses the verified exact head.