# MASTER-06 — Platform-neutral Runtime Kernel — PR Plan

## 1. Authoritative base

Authoritative `main` at phase start:

`95ebbaba7457aed3ec8e3e3ff10cb13e4bd7ebd8`

Branch:

`master/06-platform-neutral-runtime-kernel`

The first branch commit contained this plan before implementation work. No stale runtime branch is merged or replayed blindly.

## 2. Architectural responsibility

MASTER-06 owns one responsibility:

> Extend the existing `runtime-core` owner with deterministic platform-neutral session availability and continuity semantics required by web, iOS and Android hosts, without introducing platform APIs, deployment authority, renderer behavior or protected side-effect execution.

`runtime-core` remains the single kernel owner.

MASTER-06 does not create a second runtime package and does not change the canonical Experience schema.

## 3. Reverse-engineering findings

### 3.1 Existing execution lifecycle remains authoritative

Current `RuntimeLifecycle` models execution state:

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

`foreground`, `background`, connectivity and restore are not execution terminality. They must not be added to `RUNTIME_LIFECYCLES`.

Existing execution lifecycle semantics and tests remain unchanged.

### 3.2 Session availability is a separate state axis

Existing `RuntimeState.revision` is execution-semantic revision. Existing `StudioHostSnapshot.revision` is host snapshot revision.

MASTER-06 introduces a third explicitly separate revision domain for session availability/continuity only.

No comparison between these revision domains is implied.

### 3.3 Web lifecycle is not the semantic source

`runtime-web` currently owns DOM mount/commit/rollback/dispose transactions. React wraps that web runtime.

Those APIs do not own app foreground/background, network availability or persisted restore semantics and remain unchanged in MASTER-06.

MASTER-07A will translate web lifecycle signals into the common kernel semantics.

### 3.4 Host runtime is not the session owner

`studio-host-runtime` owns host snapshot/action bridging, monotonic snapshot acceptance and local duplicate-forward protection.

It does not own foreground/background/connectivity/session restore. MASTER-06 therefore extends `runtime-core` rather than `studio-host-runtime`.

### 3.5 MASTER-05 exact instance identity must be preserved

MASTER-05 established explicit mounted Experience identity through `instanceId` and rejected implicit latest/active/global targets.

Its identity grammar is intentionally opaque:

- non-empty string;
- maximum 4096 characters;
- no semantic-namespace assumption.

MASTER-06 session state therefore binds directly to exact opaque `instanceId`. It does not introduce an unrelated `sessionId` identity that could drift from the mounted Experience instance.

`runtime-core` only carries the opaque identity. Resolution remains owned by MASTER-05.

### 3.6 Persisted state cannot choose the restore target

A persisted/cache payload is data and cannot become routing authority merely because it contains an `instanceId`.

Restore therefore requires trusted caller context:

```text
restoreRuntimeSessionState(expectedInstanceId, persistedState)

expectedInstanceId  ← exact caller target
persisted.instanceId
        ↓ exact equality
match    → restore
mismatch → fail closed
```

The restore result never guesses or switches to the persisted payload's target.

### 3.7 Artifact verification authority does not exist in runtime-core

`PLATFORM_MODEL.md` requires verified cached Experience behavior, while `TRUST_MODEL.md` assigns production digest/signature verification to later deployment work.

MASTER-11 owns verified artifact/deployment authority.

Therefore MASTER-06 must not manufacture a positive `verified` state from untrusted JSON or expose a public factory whose invocation alone creates verification authority.

The safe phase boundary is:

```text
live session
  cacheStatus = inactive

persisted restore
  continuity = restored
  cacheStatus = verification-required

positive verified-cache activation
  NOT owned by MASTER-06
  requires real MASTER-11 verification evidence/authority
```

This is intentionally fail closed.

### 3.8 Resume/reconnect cannot replay protected actions

Visibility/connectivity transitions only update session semantics.

They do not:

- execute actions;
- retry pending mutations;
- invoke network/storage ports;
- bypass permissions;
- create approvals;
- resolve deployment targets.

Protected execution remains MASTER-08.

## 4. Public semantic contract

### 4.1 Session state

```ts
interface RuntimeSessionState {
  readonly version: "1";
  readonly instanceId: string;
  readonly revision: number;
  readonly visibility: "foreground" | "background";
  readonly connectivity: "connected" | "disconnected";
  readonly continuity: "live" | "restored";
  readonly cacheStatus: "inactive" | "verification-required";
}
```

Rules:

- exact closed version;
- exact opaque bounded `instanceId`;
- non-negative safe integer revision;
- closed enums;
- unknown fields fail closed;
- canonical JSON data only;
- immutable canonical output.

### 4.2 Creation

```ts
createRuntimeSessionState(instanceId, {
  visibility,
  connectivity,
})
```

Creation requires explicit initial host state. The kernel does not guess foreground or connectivity.

Initial semantics:

```text
revision     = 0
continuity   = live
cacheStatus  = inactive
```

### 4.3 Session signals

Supported versioned semantic signals:

```text
foreground
background
resume
disconnect
reconnect
```

These signals contain no platform handles or executable callbacks.

### 4.4 Pure transition

```ts
transitionRuntimeSession(state, event)
```

Rules:

- state/event are canonically validated;
- visibility and connectivity remain orthogonal;
- a semantic change increments only the session revision exactly once;
- duplicate/idempotent signal returns `changed: false` and does not churn revision;
- revision overflow fails closed;
- transition output is immutable;
- no side effects occur.

Examples:

```text
foreground + connected
  background
→ background + connected

background + connected
  disconnect
→ background + disconnected

background + disconnected
  resume
→ foreground + disconnected
```

### 4.5 Restore

```ts
restoreRuntimeSessionState(expectedInstanceId, persistedState)
```

Rules:

1. expected instance identity must be valid;
2. persisted state must parse canonically;
3. persisted `instanceId` must equal the expected instance exactly;
4. mismatch returns `INSTANCE_MISMATCH` without reflecting either ID;
5. revision must increment safely;
6. restored state becomes:

```text
continuity   = restored
cacheStatus  = verification-required
```

Restore does not assert artifact integrity and does not activate protected actions.

## 5. State invariants

1. Execution lifecycle and session availability remain orthogonal.
2. Foreground does not imply connected.
3. Background does not imply disconnected.
4. Reconnect does not imply foreground.
5. Resume does not imply connected.
6. Resume/reconnect never reopen a completed/failed/disposed execution lifecycle.
7. Duplicate semantic signals are deterministic no-ops.
8. Session revision increments only for actual session semantic changes.
9. `RuntimeState.revision` is not mutated by session transitions.
10. `StudioHostSnapshot.revision` is not mutated by session transitions.
11. Exact `instanceId` remains stable through all transitions.
12. Persisted data cannot choose another restore target.
13. `live` state requires `cacheStatus = inactive`.
14. `restored` state requires `cacheStatus = verification-required`.
15. There is no public positive `verified` cache state in MASTER-06.
16. Revisions never overflow or wrap.

## 6. Security invariants

MASTER-06 preserves:

1. no DOM/browser/UIKit/SwiftUI/Android/Compose APIs in `runtime-core`;
2. no remote executable code;
3. no renderer/native implementation metadata;
4. no raw secrets/credentials/endpoints in session contract fields;
5. no latest/active/global target;
6. no artifact/signature verification authority escalation;
7. no permission escalation from connectivity/foreground state;
8. no action replay on resume/reconnect;
9. no customer/domain branching;
10. malformed canonical JSON fails closed;
11. accessor/revoked/throwing Proxy input does not escape as an exception;
12. new errors do not echo hostile exception text;
13. cross-instance restore fails closed;
14. outputs are immutable.

## 7. Implementation ownership

Phase implementation is restricted to:

```text
packages/runtime-core/src/
  session/
    types.ts
    state.ts
    transition.ts
    index.ts
  index.ts

tests/contract/
  runtime-session.test.ts
```

Expected package dependency changes: none.

`runtime-core` remains dependent only on `protocol`.

`tooling/package-boundaries.config.mjs` remains unchanged.

## 8. Explicit non-goals

MASTER-06 does not implement:

- browser visibility listeners;
- browser online/offline listeners;
- iOS lifecycle adapters;
- Android lifecycle adapters;
- React/SwiftUI/Compose renderer integration;
- cache storage;
- artifact digest/signature verification;
- deployment validity lookup;
- promotion/rollback;
- policy/authorization changes;
- action retries or replay;
- idempotency receipts;
- approvals/challenges;
- tenant/project/environment control plane;
- network probing;
- Experience/Pack/Registry/Resolver schema changes.

These remain owned by MASTER-07, MASTER-08, MASTER-09, MASTER-11 and MASTER-12 as applicable.

## 9. Focused verification

Focused tests must prove:

### Existing kernel preservation

- `RUNTIME_LIFECYCLES` unchanged;
- foreground/background/connectivity/restore are not execution lifecycle values;
- existing runtime lifecycle/reducer/state suites remain green.

### Creation/parsing

- explicit initial visibility/connectivity;
- exact version;
- bounded opaque instance identity;
- prototype-looking identity behaves as ordinary string data;
- invalid revision/enums rejected;
- unknown fields rejected;
- immutable JSON-round-trippable output.

### Transition semantics

- foreground/background;
- disconnect/reconnect;
- resume;
- orthogonal axes;
- stable instance identity;
- changed transition increments once;
- duplicate event is no-op;
- overflow rejected.

### Restore isolation

- valid exact-instance restore succeeds;
- malformed persisted state fails closed;
- invalid expected instance fails closed;
- wrong expected instance returns `INSTANCE_MISMATCH`;
- mismatch error does not reflect either identifier;
- restored state requires external cache verification;
- overflow rejected.

### Cache trust

- no `verified` cache status exists;
- no `activate-verified-cache` event exists;
- forged `verified` JSON state is rejected;
- continuity/cache invariant cannot be self-asserted inconsistently.

### Hostile input

- revoked Proxy fails closed;
- throwing reflective Proxy fails closed;
- exception/secret text is not surfaced.

### Scope

- new kernel source imports no web/React/Studio Host/Studio Runtime/Resolver/native packages;
- no customer/domain branching;
- package boundary graph unchanged.

## 10. Repository verification gate

Before merge:

- focused MASTER-06 test PASS;
- existing runtime lifecycle/state/reducer tests PASS;
- package boundaries PASS;
- lint PASS;
- typecheck PASS;
- full test suite PASS;
- build PASS;
- `pnpm verify:all` PASS on exact PR head;
- MASTER-02 real Swift/Kotlin conformance remains green;
- browser E2E remains green.

## 11. Independent RE / QC gate

Before squash merge re-check:

- `runtime-core` remains the one kernel owner;
- no execution/session lifecycle conflation;
- no platform API/import leakage;
- no new package dependency edge;
- no verified-artifact authority invented;
- no reconnect/resume action replay;
- no implicit target;
- no cross-instance restore;
- no domain/customer switching;
- hostile inputs fail closed;
- all review threads resolved;
- exact-head hosted CI successful;
- branch 0 behind authoritative `main`;
- diff phase-scoped.

Only then record `MASTER-06 independent RE/QC: PASS` and squash merge with the verified exact head.

## 12. Acceptance gate

MASTER-06 is complete only when all are true:

1. platform-neutral session availability semantics exist in `runtime-core`;
2. existing execution lifecycle is unchanged;
3. visibility and connectivity are independent;
4. resume/reconnect are deterministic pure transitions;
5. exact instance identity is preserved;
6. restore requires caller-supplied exact instance context;
7. cross-instance restore fails closed;
8. persisted restore cannot assert verified cache trust;
9. no positive verified-cache authority is exposed before MASTER-11;
10. no protected side effect is replayed or executed;
11. session revision is independent from existing execution/host revisions;
12. no platform APIs enter `runtime-core`;
13. no dependency graph expansion occurs;
14. focused and full repository/native/browser verification pass on the exact PR head;
15. independent architecture/security/API RE/QC passes;
16. branch is 0 behind authoritative main;
17. squash merge uses the verified exact head.
