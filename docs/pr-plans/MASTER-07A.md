# MASTER-07A — Web Host — PR Plan

## 1. Authoritative base

Authoritative `main` at phase start:

`1e72e50838620558bf908d95e5a3383b115acfde`

Branch:

`master/07a-web-host`

The first branch commit contained this plan before implementation. No stale web/runtime branch is merged or replayed blindly.

## 2. Architectural responsibility

MASTER-07A owns one responsibility:

> Provide the first-class reference Web Host adapter over the already-canonical Brand, Host Capability, exact-instance resolver, session kernel and Studio runtime contracts without making web the semantic definition of Vira.

The web adapter must consume prior owners rather than duplicate them.

MASTER-07A does not create a new Experience schema, runtime kernel, resolver, Brand schema, Host Capability schema, policy system, protected Action Boundary, iOS/Android runtime or arbitrary remote HTML/JavaScript execution path.

## 3. Reverse-engineering findings

### 3.1 Two web runtime families intentionally exist

The repository has two distinct public histories:

```text
original runtime path
runtime-web
  ├─ react
  └─ web-component

canonical Studio/public GenUI path
genui
  ↓
studio-host-runtime
  ↓
studio-runtime
  ↓
studio-runtime-react
  ↓
genui-web-component
```

The README explicitly describes `react` and `web-component` as thin wrappers over the original `runtime-web` surface, while `genui` is the public Studio publication + Host + React integration surface.

Therefore MASTER-07A must not force Studio/Resolver/Brand dependencies downward into `runtime-web` merely to make every historical web API share one package.

The original `runtime-web` path remains backward-compatible and receives no new MASTER-03/04/05 ownership.

### 3.2 `genui` is the correct reference Web Host composition owner

`genui` already composes:

- `studio-host`;
- `studio-host-runtime`;
- `studio-runtime`;
- `studio-runtime-react`;
- public Studio authoring/runtime surfaces.

It is therefore the smallest existing owner that can safely compose MASTER-03 Brand metadata, MASTER-04 Host Capability, MASTER-05 exact resolution and MASTER-06 session semantics without introducing a new top-level package.

### 3.3 MASTER-03 implementation identity is not yet connected to runtime renderers

MASTER-03 defines exact mappings:

```text
component ref
  → web implementationId
  → ios implementationId
  → android implementationId
```

Existing Studio React runtime rendering expects:

```text
component ref
  → trusted renderer function
```

The missing Web Host bridge is therefore:

```text
Brand component ref
  ↓ exact MASTER-03 web implementationId
Host Manifest support
  ↓ exact local installed implementation registry
trusted renderer function
  ↓
component-ref renderer registry
  ↓
studio-runtime-react
```

No remote import, URL, path or source-code lookup is required or allowed.

### 3.4 MASTER-05 already owns exact resolution and reservation

`experience-resolver` already resolves and retains exact mounted descriptors keyed by opaque `instanceId`.

The Web Host must not accept a free-form descriptor as its routing authority. It consumes an `ExperienceResolver` and exact `instanceId`, then obtains the already-resolved descriptor through `resolver.get(instanceId)`.

The descriptor must still be defensively validated at the adapter boundary for:

- exact instance equality;
- exact Host Capability id;
- platform `web`;
- canonical JSON publication snapshot.

A successful Web Experience releases the exact resolver reservation when disposed. Failed Web Host construction does not implicitly release the resolver descriptor, allowing safe correction/retry by the caller.

### 3.5 `RuntimeState.experienceId` and mounted `instanceId` are different identities

Existing `RuntimeState.experienceId` is a bounded runtime semantic identity with its own contract.

MASTER-05/06 `instanceId` is an opaque mounted-instance routing identity.

MASTER-07A does not conflate or silently equate these identities. Exact mounted routing remains on resolver/session state; existing runtime semantic identity remains owned by `runtime-core`.

### 3.6 Browser lifecycle belongs in the Web Host adapter

MASTER-06 intentionally contains no browser APIs.

MASTER-07A translates browser observations only:

```text
visibility hidden  → background
visibility visible → resume
offline             → disconnect
online              → reconnect
```

These are signals, not permission grants, network guarantees or action replay instructions.

### 3.7 `genui-web-component` can consume the bound Web Experience directly

The existing canonical Web Component accepts a raw `ViraExperienceRuntime` plus a component-ref renderer registry.

A MASTER-07A `ViraWebExperience` already has its renderer mapping bound by the trusted Web Host. The Web Component therefore gains a second thin mount form that accepts the bound `webExperience` directly and does not accept another renderer registry on that path.

The existing raw runtime mount form remains backward-compatible.

## 4. Frozen prior owners

MASTER-07A consumes without redefining:

- Experience / publication semantics → `studio-schema`, `studio-publish`, `studio-runtime`;
- Brand package + cross-platform implementation IDs → `studio-brand`;
- Host Capability Manifest and compatibility semantics → `studio-host`;
- exact deployment/Pack/artifact/instance resolution → `experience-resolver`;
- visibility/connectivity/continuity session state → `runtime-core`;
- Host action completion and duplicate-forward protection → `studio-host-runtime`;
- React semantic rendering → `studio-runtime-react`.

No changes to these owners are expected in this phase.

## 5. Target architecture

```text
Host integration
  ├─ Web Host Capability Manifest
  ├─ trusted local implementationId → renderer registry
  ├─ browser lifecycle source
  └─ business Studio Host bridge
           │
           ▼
      createViraWebHost()
           │
           ├─ resolver.get(exact instanceId)
           │       ↓
           │   ResolvedExperienceDescriptor
           │
           ├─ Brand component → web implementationId
           │       ↓
           ├─ exact Host Manifest support
           │       ↓
           ├─ trusted installed renderer
           │
           ├─ RuntimeSessionState(instanceId)
           │
           ▼
 createViraExperienceRuntime()
           │
           ▼
 studio-host-runtime + studio-runtime
           │
           ▼
 studio-runtime-react
           │
           ├─ consumer React surface
           └─ genui-web-component
```

The historical `runtime-web → react/web-component` compatibility path remains separate and unchanged.

## 6. Public Web Host contract

The canonical phase surface is conceptually:

```ts
createViraWebHost({
  manifest,
  renderers,  // exact implementationId → trusted local renderer
  lifecycle,
})
```

The returned Host supports exact instances:

```ts
webHost.createExperience({
  resolver,
  instanceId,
  brand,
  runtimeState,
  permissionPolicy,
  host,
})

webHost.get(instanceId)
webHost.release(instanceId)
webHost.dispose()
```

No API exists for `latest`, `active`, last-mounted, DOM-selected or implicit current instance routing.

## 7. Renderer trust invariants

1. Host Manifest must be canonical and platform `web`.
2. Trusted local renderer registry keys must exactly equal Manifest `implementationIds`.
3. Every Manifest implementation ID therefore corresponds to an actually installed local renderer.
4. Brand implementation entries must exactly cover the active component catalog.
5. `component`, `web`, `ios` and `android` mapping fields remain exact MASTER-03-shaped data.
6. All three platform implementation IDs remain namespaced semantic identifiers even though this adapter executes only the web member.
7. Brand web implementation ID must be present in the Host Manifest.
8. That exact ID must resolve to the installed trusted renderer.
9. Renderer functions never appear in Host Manifest, publication, resolver descriptor or model-generated data.
10. No prefix/wildcard/closest/latest fallback exists.

## 8. Exact instance invariants

1. `instanceId` uses the existing MASTER-05/06 opaque bounded identity grammar.
2. Host active/pending instances use `Map`/`Set`, never attacker-controlled object keys.
3. A resolver descriptor must exactly match the requested `instanceId`.
4. Descriptor Host Capability identity must exactly match the active Web Host Manifest id and platform.
5. Two simultaneous instances remain independent even when they use the same Brand/Pack/deployment.
6. Releasing A does not release B.
7. Web Experience disposal releases only its own resolver reservation.
8. Prototype-looking strings are ordinary exact data, not property-routing authority.

## 9. Session / lifecycle invariants

Initial lifecycle snapshot is explicit and becomes a MASTER-06 `RuntimeSessionState` for the exact instance.

Browser mapping:

```text
hidden  → background
visible → resume
offline → disconnect
online  → reconnect
```

Rules:

- duplicate signals use MASTER-06 deterministic no-op semantics;
- only actual semantic transitions increment session revision;
- visibility/connectivity remain orthogonal;
- session revision remains separate from Studio/runtime/Host snapshot revisions;
- lifecycle listener teardown occurs on Web Experience disposal;
- invalid lifecycle events cannot mutate session state;
- reconnect/resume never retry or replay protected side effects;
- no cache verification authority is created.

## 10. Web Component compatibility

`genui-web-component` preserves its current raw runtime mount:

```ts
mount({ runtime, renderers, onHostResult? })
```

and adds the bound Web Host form:

```ts
mount({ webExperience, onHostResult? })
```

The bound form does not accept another renderer registry. Renderer choice remains owned by the Web Host mapping gate.

Unmount/disconnect continues to remove only UI subscriptions/render roots; ownership of the Web Experience lifetime remains with its Host/application unless explicitly disposed there.

## 11. Security / trust invariants

MASTER-07A must preserve:

1. no untrusted payload becomes executable renderer code;
2. no `eval`, `Function`, remote script or dynamic URL/path import;
3. no raw secrets/endpoints added to declarative Host/Experience state;
4. no arbitrary exception text reflected from trusted resolver/lifecycle callbacks;
5. exact Host Capability support fails closed;
6. exact instance mismatch fails closed without reflecting instance values;
7. Host Capability does not grant business-action permission;
8. foreground/connected state does not grant authorization;
9. reconnect/resume does not execute/replay actions;
10. no browser API enters `runtime-core`;
11. no customer/domain branching enters generic packages;
12. protected side effects remain on the existing host path pending MASTER-08.

## 12. Dependency ownership

Expected new `genui` dependency edges are only those required by its new composition responsibility:

```text
genui
  → experience-resolver
  → protocol
  → runtime-core
  → studio-brand
```

Existing `genui` dependencies on Studio Host/Runtime/React remain.

No dependency is added from `runtime-web` to Resolver, Brand, Studio Host or Studio Runtime.

`genui-web-component` continues to depend only on `genui` plus its React peer/runtime dependencies.

## 13. Focused verification

Focused tests must prove:

### End-to-end composition

- real `defineViraBrand()` output;
- real canonical Studio publication;
- real MASTER-05 resolver resolution;
- exact Host Capability identity;
- Brand web implementation ID binds to the expected trusted renderer;
- canonical Studio runtime renders through the bound component-ref registry.

### Exact instance isolation

- two simultaneous instances remain isolated;
- duplicate Web Host mount of the same exact instance is rejected;
- release/dispose of A does not affect B;
- successful disposal releases the corresponding resolver reservation;
- descriptor instance mismatch is rejected without value reflection;
- descriptor Host Capability mismatch is rejected.

### Renderer/Brand safety

- Manifest/renderer registry mismatch is rejected;
- non-web Host Manifest is rejected;
- unsupported Brand web implementation ID is rejected;
- malformed cross-platform implementation mapping is rejected;
- renderer functions remain only in the trusted local registry.

### Lifecycle

- explicit initial state;
- background / resume / disconnect / reconnect mapping;
- duplicate signal no-op;
- session revision changes only on semantic changes;
- session listener cleanup;
- Browser event listener cleanup;
- no host action is dispatched merely because lifecycle changes.

### Web Component

- historical raw runtime mount remains green;
- bound `webExperience` mount renders without a second renderer registry;
- runtime invalidation rerenders;
- render failure cleans subscription/root state.

### Existing compatibility surfaces

- original `runtime-web` suites remain green;
- original `react` wrapper remains green;
- original `web-component` wrapper remains green;
- public GenUI runtime tests remain green;
- current browser/accessibility/responsive suites remain green.

## 14. Repository verification

Before merge:

- focused MASTER-07A tests PASS;
- existing runtime-web/React/Web Component/GenUI suites PASS;
- package boundaries PASS;
- lint PASS;
- typecheck PASS;
- full test suite PASS;
- build PASS;
- browser E2E PASS;
- MASTER-02 native conformance remains green;
- `pnpm verify:all` PASS on exact PR head.

## 15. Independent RE / QC gate

Before squash merge re-check:

- web remains adapter, not semantic owner;
- `genui` is composition facade, not a duplicate schema/runtime owner;
- legacy runtime-web wrappers remain backward-compatible;
- no hidden active/global instance target exists;
- no remote executable code path exists;
- no protected action execution bypass was added;
- no browser API leaked into runtime-core;
- dependency graph has only justified upward composition edges;
- Host/Brand/Resolver/session owners remain canonical;
- domain/customer neutrality is preserved;
- all review threads are resolved;
- exact-head hosted CI is successful;
- branch is 0 behind authoritative `main`;
- final diff is phase-scoped.

Only then record `MASTER-07A independent RE/QC: PASS` and squash merge using the verified exact head.

## 16. Explicit non-goals

MASTER-07A does not implement:

- iOS SDK;
- Android SDK;
- arbitrary HTML/MCP Apps compatibility;
- protected Action Boundary;
- governance/identity/approval;
- deployment/artifact signature verification;
- tenant/project/environment/secrets control plane;
- new Experience schema;
- new Brand schema;
- new Host Capability schema;
- new resolver;
- customer/domain-specific web behavior.

## 17. Acceptance gate

MASTER-07A is complete only when all are true:

1. `genui` exposes one reference Web Host path over canonical prior-phase contracts;
2. exact resolver instance identity is preserved through Web Host lifetime;
3. Brand web implementation IDs resolve exactly to trusted installed renderers;
4. Web Host Capability identity/platform are exact and fail closed;
5. browser lifecycle/connectivity translate through MASTER-06 semantics;
6. lifecycle events cannot replay protected actions;
7. canonical `genui-web-component` can consume a renderer-bound Web Experience directly;
8. historical runtime-web/react/web-component APIs remain backward-compatible;
9. no remote executable renderer mechanism is introduced;
10. web remains an adapter/reference implementation rather than Vira semantic authority;
11. full repository/browser/native verification passes on the exact PR head;
12. independent architecture/security/API RE/QC passes;
13. branch is 0 behind authoritative main;
14. squash merge uses the verified exact head.
