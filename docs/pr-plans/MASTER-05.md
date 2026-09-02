# MASTER-05 — Generic Resolver + Instance Isolation

## Base

Authoritative base: `8367095624ca47f5ec8bdc8bec008de91c7c8d98` (MASTER-04 merged main).

This phase clean-ports only the domain-neutral, still-valid ideas from closed PR #152. The stale branch is source material, not a merge/rebase target.

## Goal

Add one platform-neutral exact Experience resolver that composes existing owners in a fixed fail-closed order and keeps mounted/resolving instance identities isolated.

Target semantic path:

```text
exact request
  ↓
exact deployment-resolution port
  ↓
exact Registry Pack id + version
  ↓
exact Pack entrypoint/artifact
  ↓
exact artifact digest resolution
  ↓
canonical JSON snapshot of publication payload
  ↓
trusted host-requirement derivation port
  ↓
MASTER-04 Host Capability compatibility
  ↓
exact instanceId reservation
  ↓
immutable resolution descriptor
```

The resolver stops at a resolution descriptor. It does not create a Studio runtime, renderer, host bridge, command adapter, policy decision, side effect, or deployment record.

## Package owner

Create `packages/experience-resolver` rather than reviving the stale web-shaped `genui-resolver` design.

`experience-resolver` owns only:

- resolver request validation;
- exact resolution ordering;
- exact Registry/Pack/artifact cross-checking;
- host compatibility evaluation by delegation to `studio-host`;
- exact local instance reservation/routing metadata;
- immutable resolved descriptor lifecycle.

It consumes and must not recreate:

- Pack grammar → `experience-packs`;
- Registry membership/exact lookup → `experience-registry`;
- generic JSON/primitive limits → `protocol`;
- Host Capability Manifest/Requirement/evaluator → `studio-host`;
- Studio publication semantic authenticity/compilation → `studio-publish` / `studio-runtime`;
- runtime/renderer/host execution → `studio-runtime`, `genui`, MASTER-07 hosts;
- protected command/action execution → MASTER-08;
- immutable enterprise deployment storage/promote/rollback → MASTER-11.

Expected direct dependency allowlist:

```text
experience-resolver
├─ protocol
├─ experience-packs
├─ experience-registry
└─ studio-host
```

No React, DOM, `genui`, `runtime-web`, `studio-runtime`, `security`, or customer-domain dependency is allowed.

## Deployment boundary

The current repository has Studio draft/publication lifecycle but no canonical immutable deployment-plane owner yet; MASTER-11 owns that future responsibility.

MASTER-05 therefore defines only an **opaque exact-resolution port**, not a persisted deployment schema or deployment control plane.

The port accepts one caller-supplied exact `deploymentId` and returns the exact Pack target needed for resolution. There is no API for:

- latest deployment;
- active deployment;
- default deployment;
- current deployment;
- environment auto-selection;
- fallback deployment.

The returned deployment identity must equal the requested identity exactly. A mismatched port result fails closed.

## Request contract

Resolver request v1 contains only:

```text
version
instanceId
 deploymentId
```

`instanceId` and `deploymentId` are opaque exact identities for this phase. MASTER-05 must not prematurely replace the future deployment-plane identity grammar with a new semantic-ID schema.

Inputs are bounded, own-data-only JSON values. Unknown fields fail closed.

## Exact Pack/artifact resolution

The exact deployment port returns:

```text
deploymentId
packId
packVersion
entrypoint
```

The resolver then:

1. calls canonical `lookupExperienceRegistryManifest(snapshot, packId, packVersion)`;
2. fails if that exact Pack id/version is absent;
3. requires the exact returned entrypoint to exist in the validated Pack manifest;
4. requires the entrypoint to identify exactly one Pack artifact;
5. requires the artifact role/media type already allowed for a Studio publication (`studio-publication` / `application/json`);
6. calls the artifact resolver with exact Pack id/version/artifact id/digest;
7. snapshots the returned artifact as bounded canonical JSON data without claiming Studio semantic validity.

Publication semantic authenticity remains enforced later by the existing canonical runtime path. `createStudioRuntimeSession()` already rebuilds through `prepareStudioPublication()` and rejects non-equivalent publications as `FORGED_PUBLICATION`; MASTER-05 must not fork this logic.

## Host compatibility boundary

MASTER-05 consumes MASTER-04; it does not recreate capability matching.

A trusted host-requirement derivation port receives only the exact resolved deployment/Pack/artifact/publication context and returns a declarative `StudioHostCompatibilityRequirement` candidate.

The resolver evaluates:

```text
evaluateStudioHostCompatibility(hostManifest, requirement)
```

Rules:

- malformed Host Manifest → fail closed;
- malformed derived requirement → fail closed;
- `compatible:false` → fail closed;
- no wildcard/prefix/nearest-version matching;
- no implicit platform substitution;
- no fallback invention;
- no executable renderer/loader handle in the resolver.

The host requirement derivation port is integration glue only. It does not become the Host Capability schema owner.

## Resolved descriptor

A successful resolution returns immutable metadata approximately shaped as:

```text
ResolvedExperienceDescriptor
├─ instanceId
├─ deploymentId
├─ pack
│  ├─ id
│  ├─ version
│  └─ entrypoint
├─ artifact
│  ├─ id
│  ├─ role
│  ├─ mediaType
│  └─ digest
├─ publication     canonical JSON snapshot, semantically untrusted until runtime gate
└─ compatibility
   ├─ platform
   └─ hostId
```

It deliberately does not contain:

- runtime/session/controller;
- React/native renderer registry;
- `prepare()` callback;
- command aliases/adapters;
- customer endpoint/credential;
- action execution function;
- policy decision;
- hidden mutable active/latest target.

## Instance isolation

One resolver instance owns a local `Map<instanceId, descriptor>` plus a pending reservation set.

Required behavior:

- exact caller-provided `instanceId` is mandatory;
- duplicate mounted `instanceId` fails;
- duplicate concurrently resolving `instanceId` fails before starting a second resolution;
- failed resolution releases the pending reservation;
- exact `get(instanceId)` may retrieve only that instance;
- exact `release(instanceId)` removes only that instance;
- resolver-wide `dispose()` clears local metadata only;
- no `latest`, `active`, first/last mounted, global target, or iteration-based implicit selection API exists;
- prototype-looking IDs remain ordinary Map keys and cannot alter resolver objects.

This is instance routing/isolation metadata, not tenant authorization. Enterprise tenant/project/environment scoping is added by its canonical control-plane owner later; resolver callers must provide already-scoped exact deployment ports.

## Stale PR #152 clean-port classification

Preserve conceptually:

- exact Registry id/version lookup;
- exact Pack entrypoint/artifact selection;
- artifact resolver interface pattern;
- mandatory exact `instanceId`;
- pending + mounted duplicate prevention;
- no global latest/active instance target;
- generic/domain-neutral source and negative tests.

Do **not** port:

- executable `ViraRuntimeCapabilityProfile.prepare()`;
- React renderer registries in resolver profiles;
- command adapter execution;
- manual Studio publication schema/version/dependency validation;
- direct `createViraExperienceRuntime()` calls;
- manual renderer coverage checks;
- React Chat surface (`genui-chat`) — MASTER-07A concern;
- stale package/TS config churn unless current main independently requires it.

## Security invariants

- canonical JSON input only;
- unknown fields fail closed;
- bounded request identities and bounded resolver-owned arrays/records;
- no accessors/symbol/non-enumerable executable data accepted through declarative request/artifact paths;
- exact id/version/digest comparisons only;
- no string interpolation into filesystem/network paths;
- no URL fetch implementation;
- no raw secrets;
- no untrusted object-key dictionary for instances (use `Map`);
- no domain/customer switches;
- resolver-owned failure messages avoid echoing attacker-controlled identity/content where not necessary;
- unexpected trusted-port throws become typed fail-closed resolution failures;
- pending reservation cleanup is guaranteed with `finally` semantics.

## Focused tests

Add contract tests proving at minimum:

1. exact deployment → Registry Pack → entrypoint/artifact → host compatibility → immutable descriptor happy path;
2. web/iOS/Android compatibility uses the same resolver contract;
3. deployment result identity mismatch fails closed;
4. missing exact Pack version fails; no nearest/latest selection;
5. unknown entrypoint / missing artifact / wrong artifact role/media type fail;
6. artifact resolver receives exact digest and failures are typed;
7. artifact publication is canonical JSON-snapshotted but not recompiled by resolver;
8. malformed Host Manifest and malformed requirement are distinguishable typed failures;
9. valid `compatible:false` fails without fallback;
10. duplicate mounted instance fails;
11. duplicate pending instance fails under concurrent resolution;
12. failure frees pending reservation for retry;
13. exact release removes only the selected instance;
14. resolver dispose clears local metadata and blocks future resolution;
15. `__proto__`/`constructor`-like instance strings cannot poison storage;
16. unknown request/backend/credential/fallback/executable fields fail closed;
17. generic source contains no Pegasus/Flight/Airline/Recipe domain switching;
18. package boundary graph contains only the minimum allowed dependencies.

## Explicit non-goals

Not in MASTER-05:

- deployment persistence/promote/rollback;
- network Registry transport;
- OCI/S3/CDN client;
- signature verification plane beyond existing owner contracts;
- renderer selection/activation;
- runtime construction;
- Chat/React UI;
- iOS/Android SDK code;
- command execution;
- Action Boundary;
- tenant/org/environment authorization;
- fallback routing.

## Verification gate

Before merge:

1. focused resolver contract tests PASS;
2. package-boundary/lint/typecheck PASS;
3. full repository/browser/native gates PASS on exact head;
4. diff remains domain-neutral and phase-scoped;
5. no stale #152 executable/runtime/web code is imported;
6. no unresolved P1/P2 review findings;
7. authoritative `main` is unchanged or branch is reconciled before merge;
8. exact-head independent architecture/security/API RE/QC PASS;
9. squash merge only with expected-head guard.
