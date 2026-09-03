# MASTER-06 — Platform-neutral Runtime Kernel — PR Plan

## 1. Authoritative base

This phase starts only from authoritative `main`:

`95ebbaba7457aed3ec8e3e3ff10cb13e4bd7ebd8`

Branch:

`master/06-platform-neutral-runtime-kernel`

This plan file is the first branch commit. No implementation from an older branch is merged or replayed blindly.

## 2. Architectural responsibility

MASTER-06 owns one responsibility:

> Preserve and harden the existing `runtime-core` as the platform-neutral execution/state kernel by adding common app/session availability semantics needed by web, iOS and Android hosts without introducing browser, UIKit, SwiftUI, Android, Compose or other OS APIs into the kernel.

The semantic owner remains the existing `runtime-core` package.

This phase does **not** create a second runtime package, replace the canonical execution lifecycle, implement web/iOS/Android host adapters, verify production artifact signatures, replay protected actions, or introduce the MASTER-08 Action Boundary.

## 3. Reverse-engineering findings

### 3.1 `runtime-core` is already the canonical owner

`PACKAGE_OWNERSHIP.md` assigns `runtime-core` the platform-neutral runtime actions, permissions, lifecycle, patches, reducer and state responsibility and explicitly assigns MASTER-06 to extending that owner.

The package currently depends only on `protocol` and exports:

- state;
- actions;
- patches;
- lifecycle;
- permissions;
- errors;
- reducer.

Therefore a new runtime-kernel package would create a duplicate owner and is forbidden.

### 3.2 Existing lifecycle is an execution lifecycle, not app availability

Current execution lifecycle values are:

```text
created
mounting
active
updating
completed
cancelled
failed
disposed
```

The current transition table models execution state and terminality:

```text
created
  ↓
mounting
  ↓
active ⇄ updating
  ↓
completed / cancelled / failed
  ↓
disposed
```

Existing contract tests intentionally reject host-specific pseudo-lifecycle values such as `browser-mounted`.

MASTER-06 must **not** insert `foreground`, `background`, `disconnected` or similar host/session concepts into `RUNTIME_LIFECYCLES`. Those concepts are orthogonal to execution terminality and would make states such as “completed but backgrounded” impossible or ambiguous.

The existing execution lifecycle contract remains backward-compatible unless reverse engineering proves a defect independent of MASTER-06.

### 3.3 `RuntimeState` is canonical execution state

Current `RuntimeState` contains:

```ts
{
  experienceId,
  revision,
  lifecycle,
  plan,
}
```

Its revision is execution semantic revision. MASTER-06 must not silently redefine this revision as application visibility/connectivity revision.

A new session/availability state, if revisioned, must use an explicitly separate revision identity.

### 3.4 Runtime reducer effects are business/runtime effects, not platform lifecycle events

Current `RuntimeEffect` is limited to:

- `host-action`;
- `confirmation-required`.

Foreground/background/disconnect/reconnect/restore must not be encoded as fake action effects merely to reuse the reducer.

MASTER-06 may add an independent pure session reducer/state transition surface inside `runtime-core`, but protected actions remain on their existing path and later cross MASTER-08.

### 3.5 Existing web lifecycle code is not the semantic source

`runtime-web` DOM lifecycle tests own transactional browser mount/commit/rollback/dispose behavior.

The React lifecycle session wrapper delegates mount, runtime state and actions to the web runtime.

Neither surface currently models application foreground/background, network connectivity, reconnect or session restore. Those web-specific mount semantics remain web-owned and are not moved into `runtime-core`.

### 3.6 `studio-host-runtime` does not own app connectivity/visibility

`studio-host-runtime` owns the bridge from canonical Studio runtime sessions to host snapshots/actions, including monotonic host snapshot acceptance and per-session duplicate forwarding.

It does not own foreground/background/connectivity/session-restore state. Extending `runtime-core` with a platform-neutral session axis therefore does not duplicate the host-runtime owner.

### 3.7 Host snapshot revision is a separate existing revision domain

`StudioHostSnapshot` has its own `revision` and host state/domain payload.

MASTER-06 must keep three concepts distinct:

```text
RuntimeState.revision          execution semantic revision
StudioHostSnapshot.revision   host snapshot revision
Runtime session revision      MASTER-06 availability/continuity revision, if needed
```

No implicit comparison between these revision domains is permitted.

### 3.8 No existing foreground/background/reconnect implementation was found

Repository search and targeted package inspection found no canonical implementation for:

- browser visibility lifecycle;
- offline/online transition semantics;
- reconnect semantics;
- cross-platform session restore.

MASTER-06 therefore introduces new shared semantics rather than extracting an existing web implementation and declaring it canonical.

### 3.9 Verified artifact integrity belongs to the deployment plane

`PLATFORM_MODEL.md` requires verified cached Experience support and reconnect behavior, while `TRUST_MODEL.md` states production digest/signature verification is owned by later deployment phases.

MASTER-11 owns:

```text
Publication
  ↓
Pack
  ↓
content-addressed verified artifact
  ↓
registry
  ↓
deployment
```

Therefore MASTER-06 must not:

- invent a signature scheme;
- declare arbitrary cache bytes trusted;
- turn a digest string into proof of verification;
- make `runtime-core` a deployment/artifact verifier.

MASTER-06 may model **cache eligibility/evidence already established by a trusted upstream owner** and fail closed when required verification evidence is absent.

### 3.10 Offline/reconnect does not grant action permission or replay authority

The platform/trust contracts state:

- offline support does not imply offline permission for every action;
- reconnect must not blindly replay protected mutations;
- stale revisions fail closed where relevant;
- retries use explicit idempotency semantics.

MASTER-08 owns end-to-end Action Boundary, expected revisions and idempotency. MASTER-06 must not autonomously execute or replay protected side effects on resume/reconnect.

## 4. Proposed semantic model

Exact public names may change if repo conventions require it, but the ownership split is frozen.

### 4.1 Keep execution lifecycle unchanged

`RuntimeLifecycle` remains the execution axis.

MASTER-06 introduces a separate canonical session/availability contract rather than adding host states to `RUNTIME_LIFECYCLES`.

Conceptually:

```text
Runtime execution
  lifecycle: active

Runtime session
  visibility: background
  connectivity: disconnected
  continuity: live
```

These states can coexist without corrupting terminal execution semantics.

### 4.2 Session visibility

Target semantic axis:

```ts
type RuntimeSessionVisibility = "foreground" | "background";
```

This describes host application/session visibility only. It is not DOM visibility, route focus or business activity.

Host adapters in MASTER-07 translate browser/UIKit/Android lifecycle callbacks into this contract.

### 4.3 Connectivity

Target semantic axis:

```ts
type RuntimeSessionConnectivity = "connected" | "disconnected";
```

This is a canonical availability signal, not permission to execute network actions.

MASTER-06 does not probe the network. Hosts/adapters report transitions.

### 4.4 Continuity / restore state

A separate continuity axis is expected so resume/restore semantics are not overloaded into visibility.

Candidate semantics to validate during implementation RE:

```ts
type RuntimeSessionContinuity = "live" | "restored";
```

or an equivalent closed model with explicit transition events.

The final model must distinguish at least:

- a live in-memory session;
- a session restored from trusted persisted state.

It must not claim that restored data is production-artifact verified unless upstream evidence proves that fact.

### 4.5 Cache activation evidence

MASTER-06 needs a declarative fail-closed way to represent whether a cached Experience is eligible for activation without performing artifact verification itself.

The default design direction is an explicit trusted input/evidence contract that distinguishes:

```text
not supplied / not verified / verified-by-upstream-owner
```

The exact type must be finalized only after additional reverse engineering of current resolver/deployment identity surfaces.

Required invariant:

> `runtime-core` may consume verification evidence, but may not manufacture verification authority.

The evidence must not contain executable code, raw secrets, provider credentials or platform handles.

### 4.6 Session state

Target shape conceptually:

```ts
interface RuntimeSessionState {
  readonly version: "1";
  readonly sessionId: string;
  readonly revision: number;
  readonly visibility: RuntimeSessionVisibility;
  readonly connectivity: RuntimeSessionConnectivity;
  readonly continuity: RuntimeSessionContinuity;
  readonly cache: ...;
}
```

The final shape may be narrower if additional RE proves some fields belong elsewhere.

Rules:

- closed versioned contract;
- bounded explicit IDs;
- canonical JSON data only;
- exact closed enums;
- safe non-negative revision;
- unknown fields fail closed;
- immutable outputs;
- no platform/API handles;
- no tenant/policy/action authority embedded.

### 4.7 Session events / transitions

Target events represent semantic platform lifecycle changes, for example:

```text
background
foreground / resume
disconnect
reconnect
restore
activate-verified-cache
```

The final API should be pure and deterministic, likely through a dedicated session transition/reducer function inside `runtime-core`.

Rules:

- illegal transitions fail closed;
- revision increments exactly once per accepted semantic transition;
- no-op/duplicate event behavior is explicit and tested;
- revision overflow fails closed;
- transition output is immutable;
- no callback/side-effect execution occurs in the transition function.

## 5. State-machine invariants

The implementation must preserve these invariants:

1. Execution lifecycle and session availability are orthogonal.
2. `completed/cancelled/failed/disposed` execution semantics are not reopened by foreground/reconnect.
3. Background does not mean disconnected.
4. Disconnected does not mean background.
5. Foreground does not imply connected.
6. Reconnect does not imply action replay.
7. Resume does not create a new deployment/instance implicitly.
8. Restore requires explicit trusted persisted-state input.
9. Verified cache activation requires explicit verification evidence; missing/invalid evidence fails closed.
10. A session transition never performs network, storage, crypto, render or action side effects.
11. Duplicate/out-of-order transitions have deterministic behavior.
12. Revisions never overflow or silently wrap.

## 6. Security / trust invariants

MASTER-06 must preserve all of the following:

1. **No OS APIs in core.** No DOM, `window`, browser events, UIKit, SwiftUI, Android `Context`, Compose or platform SDK imports.
2. **No remote executable code.** Session/cache data remains declarative.
3. **No artifact authority escalation.** Cache metadata cannot self-assert production trust merely through a string flag from untrusted JSON.
4. **No action replay.** Resume/reconnect never re-executes protected actions.
5. **No permission escalation.** Connected/foreground state does not grant permission.
6. **No implicit target.** Session state never chooses latest/active deployment or Experience instance.
7. **No secret state.** Credentials/tokens/raw secrets are invalid session data.
8. **No customer/domain branching.** Generic runtime source remains domain-neutral.
9. **Fail closed on malformed persisted state.** Unknown fields, invalid versions, hostile reflection/proxy inputs and invalid revisions do not become restored sessions.
10. **Bounded data.** IDs/persisted payloads have explicit resource limits and use canonical JSON budgets where appropriate.
11. **Immutable canonical outputs.** Parsed/transitioned state cannot be mutated after validation.
12. **No provider-specific verification semantics.** MASTER-11/12/09 owners remain separate.

## 7. Expected implementation ownership

Default implementation scope:

```text
packages/runtime-core/src/
  session/
    types.ts
    create.ts / parse.ts / transition.ts (or repo-conventional equivalent)
    index.ts
  index.ts

tests/contract/
  runtime-session*.test.ts
```

Expected dependency changes:

- ideally none;
- `runtime-core` remains dependent only on `protocol`;
- `tooling/package-boundaries.config.mjs` should remain unchanged.

No `runtime-web`, React, Studio runtime, Host, Registry, Resolver, security, policy or native SDK dependency is expected.

## 8. Additional RE required before implementation

Before writing the public session contract, verify:

1. current `runtime-core` state creation/parser/deep-freeze conventions;
2. current runtime-web SDK state/session consumers;
3. host snapshot monotonic revision semantics;
4. exact MASTER-05 resolution descriptor fields that future hosts can bind to a session without importing resolver ownership into core;
5. whether any persisted session/cache contract already exists under another package;
6. repository ID/version syntax conventions for a session identity;
7. whether cache verification evidence should be an opaque trusted constructor capability rather than directly parseable untrusted JSON.

If this RE shows verification evidence cannot be represented safely without MASTER-11, MASTER-06 will model restore/availability now and leave verified cache **activation authorization** as an explicit unimplemented fail-closed port for MASTER-11 rather than invent authority.

## 9. Focused verification

Focused tests must cover at least:

### Execution lifecycle preservation

- existing `RuntimeLifecycle` values unchanged;
- existing transition matrix unchanged;
- host/session events cannot reopen terminal execution state;
- existing runtime lifecycle tests remain green.

### Session creation / parsing

- deterministic initial session state;
- exact version validation;
- bounded session ID;
- invalid visibility/connectivity/continuity rejected;
- invalid/overflow revision rejected;
- unknown fields rejected;
- accessor/proxy/hostile input fails closed without exception leakage;
- output deeply immutable where needed.

### Orthogonal session transitions

- foreground → background;
- background → foreground/resume;
- connected → disconnected;
- disconnected → connected/reconnect;
- background + connected is valid;
- foreground + disconnected is valid;
- one axis transition preserves other axes;
- accepted transition increments session revision once;
- duplicate/no-op behavior deterministic;
- revision overflow rejected.

### Restore

- valid persisted session restores explicitly;
- malformed/unknown-version persisted state fails closed;
- restored state does not silently alter runtime execution revision/lifecycle;
- restore never calls host/network/action side effects.

### Verified cache behavior

Subject to final RE of the safe evidence boundary:

- missing verification evidence denies verified-cache activation;
- invalid/untrusted self-asserted verification denies;
- trusted verification evidence allows only passive cached Experience activation semantics;
- no action replay is emitted;
- exact instance/deployment identity is not guessed.

### Platform neutrality / scope

- source imports no web/React/native/Studio host/runtime modules;
- generic source contains no customer/domain switch;
- package-boundary graph remains unchanged.

## 10. Repository verification

Before merge:

- focused MASTER-06 tests PASS;
- existing runtime lifecycle/reducer/state tests PASS;
- `pnpm check:boundaries` PASS;
- lint PASS;
- typecheck PASS;
- full test suite PASS;
- builds PASS;
- `pnpm verify:all` PASS on exact PR head;
- MASTER-02 Swift/Kotlin conformance remains green;
- browser E2E remains green.

## 11. Independent RE / QC gate

Before merge independently re-check:

- `runtime-core` remains the single kernel owner;
- existing execution lifecycle semantics are not conflated with session availability;
- no platform API leaked into core;
- no new dependency edge was introduced unless explicitly justified;
- no artifact/signature authority was invented;
- no reconnect/resume action replay exists;
- no latest/active/global target exists;
- no customer/domain branching exists;
- session revisions are distinct from RuntimeState/HostSnapshot revisions;
- malformed/hostile inputs fail closed without secret/exception reflection;
- all review threads resolved;
- exact-head hosted CI successful;
- branch 0 behind authoritative main;
- final diff phase-scoped.

Only then: `RE/QC: PASS` and squash merge using the verified exact head.

## 12. Explicit non-goals

MASTER-06 does not implement:

- web visibility event adapter;
- iOS application lifecycle adapter;
- Android lifecycle adapter;
- SwiftUI/Compose/React renderer changes;
- production artifact signature/digest verification;
- deployment validity lookup/promotion/rollback;
- action execution or replay;
- idempotency receipts;
- governance/identity/approval;
- tenant/project/environment control plane;
- platform-specific cache storage;
- network probing;
- Experience schema changes;
- Pack/Registry/Resolver schema changes;
- customer/domain-specific lifecycle behavior.

These remain owned by MASTER-07, MASTER-08, MASTER-09, MASTER-11 and MASTER-12 as applicable.

## 13. Acceptance gate

MASTER-06 is complete only when all are true:

1. `runtime-core` remains the sole platform-neutral runtime-kernel owner;
2. current execution lifecycle semantics remain intact;
3. foreground/background and connected/disconnected are represented as orthogonal common session semantics;
4. resume/reconnect/session restore are deterministic pure state transitions;
5. restore/cached activation cannot manufacture artifact trust;
6. no reconnect/resume action replay exists;
7. no platform API or renderer dependency enters `runtime-core`;
8. session state is bounded, immutable and fail-closed;
9. revision domains remain explicit and non-conflated;
10. web/iOS/Android hosts can later adapt their lifecycle events into the same contract;
11. full repository/browser/native verification passes on exact PR head;
12. independent architecture/security/API RE/QC passes;
13. branch is 0 behind authoritative main;
14. final diff is phase-scoped;
15. squash merge uses the verified exact head.
