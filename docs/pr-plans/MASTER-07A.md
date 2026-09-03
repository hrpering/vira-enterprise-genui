# MASTER-07A — Web Host — PR Plan

## 1. Authoritative base

This phase starts only from authoritative `main`:

`1e72e50838620558bf908d95e5a3383b115acfde`

Branch:

`master/07a-web-host`

This plan file is the first branch commit. No older web/runtime branch is merged or replayed blindly.

## 2. Architectural responsibility

MASTER-07A owns one responsibility:

> Reconcile the existing web runtime/public web surfaces with the common Host Capability, exact-instance and platform-neutral session contracts so web becomes the reference first-class host implementation without becoming the semantic definition of Vira.

Web remains an adapter/implementation over canonical cross-platform semantics.

This phase does **not** create a new Experience schema, new runtime kernel, new resolver, new policy system, new protected Action Boundary, iOS/Android renderer, deployment plane or arbitrary HTML compatibility path.

## 3. Frozen inputs from previous phases

MASTER-07A must consume, not duplicate:

- canonical Experience semantics → `studio-schema` / publication path;
- exact brand platform implementation IDs → MASTER-03 `studio-brand`;
- Host Capability Manifest / compatibility → MASTER-04 `studio-host`;
- exact deployment/Pack/publication/instance resolution → MASTER-05 `experience-resolver`;
- platform-neutral session availability/continuity → MASTER-06 `runtime-core`;
- current browser/DOM rendering → existing `runtime-web`;
- current React wrapper → existing `react`;
- current Web Component wrapper → existing `web-component`;
- public Studio/GenUI web facade → existing `genui` / `genui-web-component`;
- current trusted JS renderer activation → existing Studio brand/loader/runtime owners.

## 4. Global invariants

MASTER-07A preserves:

1. One canonical Experience model.
2. Web does not redefine semantic components, actions or state.
3. Exact `instanceId`; no last-mounted/active/global routing.
4. Exact Host Capability support; no fallback invention.
5. Host implementation IDs resolve only to trusted installed web implementations.
6. No arbitrary remote JavaScript/HTML execution as a Vira native/web Experience mechanism.
7. `runtime-core` remains browser-free.
8. Browser lifecycle APIs stay in the web adapter and translate into MASTER-06 session semantics.
9. Web renderer events produce canonical semantic actions, not business side effects directly.
10. Protected side effects remain future MASTER-08 responsibility.
11. Runtime/host/session revisions remain distinct and deterministic.
12. Generic web packages remain customer/domain neutral.
13. Existing public web APIs remain backward compatible unless RE proves a security/architecture defect.
14. Unsupported Host Capability fails closed.
15. No dependency edge is added without an explicit owner justification.

## 5. Required reverse engineering before implementation

Before writing implementation code, inspect and map:

### 5.1 Current web runtime path

- `runtime-web` package exports;
- SDK creation/configuration;
- mount/unmount/dispose lifecycle;
- DOM port boundaries;
- state binding/reducer path;
- user-event/action bridge;
- capability/component security gates;
- accessibility/responsive owners.

### 5.2 Current public wrappers

- `react` wrapper lifecycle and configuration;
- `web-component` wrapper lifecycle/events;
- `genui` public runtime facade;
- `genui-web-component` public wrapper;
- any chat-facing runtime bridge.

Determine whether these all converge on one canonical web runtime or whether parallel activation paths still exist.

### 5.3 Current Studio web path

Inspect:

- `studio-runtime`;
- `studio-runtime-react`;
- `studio-host`;
- `studio-host-runtime`;
- `studio-brand-loader`.

Identify which path is authoritative for current public Studio publications and which original runtime path remains separately exposed.

### 5.4 Host Capability integration gap

Find whether current web runtime:

- constructs a MASTER-04 `StudioHostCapabilityManifest`;
- evaluates exact implementation IDs/capabilities before mount;
- has any duplicate/manual capability logic that must be removed or delegated;
- can expose one reference web Host Manifest without customer/domain switching.

### 5.5 Exact instance integration gap

Map how current web APIs identify mounted Experiences.

Find and remove/avoid any routing based on:

- current mounted Experience;
- latest mount;
- singleton active runtime;
- DOM element identity as business instance identity;
- hidden global target.

The target web path must bind explicit MASTER-05 `instanceId` through mount/session/action routing where applicable.

### 5.6 MASTER-06 session adapter gap

Map browser signals to common semantics:

```text
Document visibility / page lifecycle
          ↓
foreground / background / resume

online/offline signal
          ↓
connected / disconnected / reconnect
```

The browser adapter must not probe or claim more network truth than the browser signal provides.

Determine whether the adapter belongs in `runtime-web` or another existing web owner based on current package boundaries.

### 5.7 Trusted implementation resolution gap

Determine where semantic web implementation IDs from MASTER-03 should be resolved to installed renderer implementations.

Rules:

- reuse the existing trusted renderer activation owner;
- no dynamic remote import;
- no URL/path/source-code field;
- exact ID only;
- missing implementation fails closed;
- no customer-name switch in generic source.

MASTER-07A may add a web-specific trusted registry/adapter only if RE proves the existing owner cannot represent this without ownership drift.

### 5.8 Public API convergence

Determine the smallest public web Host facade that can be consumed consistently by:

- React;
- Web Component;
- Chat/public GenUI;
- Studio runtime React surface where appropriate.

Do not introduce another facade if the existing public `genui` owner can be extended safely.

## 6. Expected target architecture

Conceptually:

```text
ResolvedExperienceDescriptor (MASTER-05)
        +
Web Host Capability Manifest (MASTER-04)
        +
Web trusted implementation registry
        +
RuntimeSessionState (MASTER-06)
        ↓
Web Host Adapter
        ↓
existing runtime / Studio runtime semantics
        ↓
React / Web Component / Chat surfaces
```

The exact package ownership will be finalized only after RE.

## 7. Browser lifecycle target

Expected adapter behavior:

```text
initial host observation
  → createRuntimeSessionState(instanceId, explicit visibility/connectivity)

visibility hidden
  → background

visibility visible after background
  → foreground or resume according to final adapter contract

offline
  → disconnect

online after disconnect
  → reconnect
```

Rules:

- browser callbacks are translated, never stored in `runtime-core`;
- duplicate browser events inherit MASTER-06 deterministic no-op semantics;
- adapter teardown removes listeners;
- disposed/unmounted instances do not continue receiving lifecycle updates;
- lifecycle updates target exact instance state only;
- reconnect does not replay protected actions;
- no implicit cache verification occurs.

## 8. Host Capability target

A reference web Host Manifest must be declarative and exact.

At minimum it should identify:

- platform `web`;
- host identity;
- trusted supported implementation IDs;
- supported canonical capabilities.

It must not carry:

- renderer functions;
- DOM nodes;
- URLs;
- dynamic imports;
- secrets;
- backend endpoints.

Actual functions/DOM handles stay in trusted local web implementation code, not the declarative manifest.

## 9. Compatibility / mount gate

Before a resolved Experience is mounted through the common host path:

1. exact descriptor/instance context is known;
2. exact web Host Manifest is known;
3. host requirement compatibility is already/again consumed through the canonical MASTER-04 evaluator as appropriate to ownership;
4. semantic component implementation IDs resolve exactly to trusted local web implementations;
5. missing/unsupported implementation fails closed;
6. only then may the web renderer mount.

No prefix, wildcard, `latest`, closest-match or fallback guessing is permitted.

## 10. Security / trust checks

Focused security review must verify:

- no untrusted payload becomes a renderer function;
- no `eval`, `Function`, remote script or dynamic URL import is introduced;
- no DOM/host exception content is reflected to untrusted output;
- lifecycle callbacks cannot route to another instance;
- disposed instances stop receiving events;
- unsupported implementation/capability fails closed;
- platform manifest cannot grant authorization;
- component support does not grant business-action permission;
- reconnect/resume does not trigger action execution;
- generic source contains no Pegasus/airline/customer switching.

## 11. Expected implementation scope

Default expectation after RE:

```text
packages/runtime-web/
  existing SDK/host integration extension

packages/react/
  thin adaptation only if needed

packages/web-component/
  thin adaptation only if needed

packages/genui/
  public facade convergence only if current owner requires it

tests/contract/
tests/integration/
```

Changes to `studio-host`, `runtime-core`, `experience-resolver` or canonical Studio schema are **not expected**. If implementation appears to require changing those owners, stop and perform architecture reconciliation before coding.

## 12. Focused verification

Tests should cover as applicable after RE:

### Host manifest / compatibility

- reference web manifest is valid and immutable;
- exact supported implementation resolves;
- missing implementation fails closed;
- near/prefix/wildcard match fails;
- unsupported capability fails closed;
- manifest contains no executable renderer surface.

### Exact instance routing

- two simultaneous web instances remain isolated;
- lifecycle event for A does not mutate B;
- actions emitted from A retain A context where owned by this phase;
- release/dispose of A does not affect B;
- prototype-looking IDs behave as ordinary exact IDs.

### Browser lifecycle adapter

- explicit initial state;
- hidden → background;
- visible/resume → foreground;
- offline → disconnected;
- online/reconnect → connected;
- duplicate signals do not churn revision;
- teardown removes listener effects;
- no action replay.

### Existing web behavior

- current mount/state-binding/action rendering tests remain green;
- React wrapper remains thin;
- Web Component event semantics remain stable;
- public GenUI web path remains canonical;
- browser accessibility/responsive gates remain green.

### Security

- unsupported/untrusted renderer ID denied;
- no remote executable metadata;
- hostile host/DOM callback failures are normalized where crossing trust boundaries;
- no cross-instance leakage.

## 13. Repository verification

Before merge:

- focused MASTER-07A tests PASS;
- existing runtime-web contract/integration suites PASS;
- React/Web Component suites PASS;
- package boundaries PASS;
- lint PASS;
- typecheck PASS;
- full test suite PASS;
- build PASS;
- browser E2E PASS;
- MASTER-02 native conformance remains green;
- `pnpm verify:all` PASS on exact PR head.

## 14. Independent RE / QC gate

Before squash merge re-check:

- web remains adapter, not semantic owner;
- no duplicate Host Capability/Experience/runtime schema;
- no hidden active/global instance target;
- no remote executable code path;
- no action execution bypass;
- no browser API leaks into runtime-core;
- no unnecessary dependency cycles/edges;
- all current public wrappers converge correctly;
- domain/customer neutrality preserved;
- all review threads resolved;
- exact-head CI successful;
- branch 0 behind authoritative `main`;
- final diff phase-scoped.

Only then record `MASTER-07A independent RE/QC: PASS` and squash merge using the verified exact head.

## 15. Explicit non-goals

MASTER-07A does not implement:

- iOS SDK;
- Android SDK;
- arbitrary HTML/MCP Apps compatibility surface;
- Action Boundary;
- governance/identity/approval;
- deployment/artifact verification plane;
- tenant/project/secrets;
- new Experience schema;
- new Brand schema;
- new Host Capability schema;
- new generic resolver;
- customer/domain-specific web behavior.

## 16. Acceptance gate

MASTER-07A is complete only when all are true:

1. one reference web Host path consumes canonical Host Capability semantics;
2. exact instance identity is preserved across web host lifecycle;
3. browser lifecycle/connectivity translate into MASTER-06 session semantics;
4. trusted web implementation resolution is exact and fail closed;
5. React/Web Component/public GenUI surfaces remain thin consumers of the canonical web host path;
6. no remote executable renderer mechanism is introduced;
7. existing execution/action semantics remain owned by their canonical packages;
8. no protected side effect bypass is introduced;
9. web is a reference host, not the semantic definition of Vira;
10. full repository/browser/native verification passes on exact head;
11. independent architecture/security/API RE/QC passes;
12. branch is 0 behind authoritative main;
13. squash merge uses the verified exact head.
