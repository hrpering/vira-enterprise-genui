# MASTER-04 — Host Capability Manifest — PR Plan

## 1. Authoritative base

This phase starts only from authoritative `main`:

`86f366db0ddbd6a0b1b797d75f127beb4103059a`

Branch:

`master/04-host-capability-manifest`

This plan file is the first branch commit. No implementation from an older branch is to be merged or replayed blindly.

## 2. Architectural responsibility

MASTER-04 owns one responsibility:

> Define a single platform-neutral, declarative Host Capability Manifest and exact fail-closed compatibility evaluator reported/used consistently by web, iOS and Android hosts.

The semantic owner will be the existing `studio-host` package.

This phase does **not** create a second host runtime, renderer registry, Experience schema, policy system, capability planner, resolver, or fallback router.

## 3. Reverse-engineering findings

### 3.1 Existing host owner

`studio-host` already owns the host bridge boundary:

- host snapshot contract;
- host action result contract;
- snapshot / dispatch / subscribe bridge;
- canonical validation and immutable outputs.

It does not currently own a device/platform capability manifest. Therefore extending `studio-host` with a declarative manifest is an extension of the existing owner rather than a duplicate package.

### 3.2 Generic capability owner remains `protocol`

The generic protocol `Capability` contract is intentionally small:

```ts
{
  version: "1";
  id: string;
}
```

`protocol` already exports `parseCapability()` and semantic-namespace validation. MASTER-04 will reuse these. It will not inflate generic `Capability` with host, device, renderer or OS fields.

### 3.3 Security capability policy is a different concern

The `security` package owns capability authorization / allowlist policy. Host support and security authorization are not equivalent.

MASTER-04 answers:

> Can this concrete host technically support the declared requirement?

It does not answer:

> Is this actor allowed to use it?

No new `studio-host -> security` dependency is expected.

### 3.4 Brand implementation mapping already exists

MASTER-03 introduced exact semantic component implementation IDs for:

- web;
- iOS;
- Android.

Those IDs are inert identifiers, not executable code or URLs. MASTER-04 gives each host a common way to declare which trusted implementation IDs it actually supports.

The expected future chain is:

```text
semantic component
  ↓
brand platform implementation ID
  ↓
Host Capability Manifest support
  ↓
MASTER-05 exact compatibility/resolution
  ↓
MASTER-07 trusted local platform resolution
  ↓
existing loader/runtime activation
```

MASTER-04 does not perform the MASTER-05 or MASTER-07 steps.

### 3.5 Existing renderer activation owner remains unchanged

`studio-brand-loader` currently maps validated semantic component references to trusted in-process JS renderer implementations. It remains the JS activation owner.

The Host Capability Manifest may declare support for semantic implementation IDs, but it must never carry:

- renderer functions;
- dynamic imports;
- JavaScript source;
- Swift/Kotlin binaries;
- URLs;
- filesystem paths;
- DOM/UIKit/Android Context handles.

### 3.6 Canonical Experience schema has no fallback field

`StudioExperienceDocument` currently owns only canonical Experience semantics such as views, nodes, bindings and interactions. It has no capability or fallback routing field.

MASTER-04 will not add a platform/fallback fork to the Experience schema.

### 3.7 Publication and Pack metadata do not yet own host fallback

`StudioPublication.manifest` currently declares component references, action events and binding sources. `experience-packs` compatibility currently declares Vira-version compatibility, not host fallback routing.

There is therefore no existing canonical owner from which MASTER-04 can safely consume an author-declared fallback.

The master-plan invariant remains:

> Unsupported Experiences fail closed unless the author explicitly declared a compatible fallback. Agents may not invent fallback behavior.

Because no canonical authored-fallback owner exists yet, the only legal behavior implemented in MASTER-04 is **fail closed on incompatibility**. This phase will not invent a fallback contract merely to make the evaluator return success.

A later phase may connect an explicitly authored fallback once its canonical publication/Pack/deployment owner is defined. MASTER-05 must consume incompatibility as-is and may not manufacture fallback.

### 3.8 Planner already has its own `CapabilityRequirement`

The planner has a domain-specific `CapabilityRequirement { field, capability }` used for planning. MASTER-04 must not introduce another ambiguous generic type with the same semantic name.

Host types will be explicitly host-scoped.

## 4. Proposed public contracts

Names may be adjusted only if reverse engineering finds a direct repo convention conflict, but semantic ownership must remain unchanged.

### 4.1 Platform

```ts
type StudioHostPlatform = "web" | "ios" | "android";
```

Exactly these three first-class platforms are in MASTER-04 scope.

### 4.2 Host Capability Manifest

Target shape:

```ts
interface StudioHostCapabilityManifest {
  readonly version: "1";
  readonly id: string;
  readonly platform: StudioHostPlatform;
  readonly implementationIds: readonly string[];
  readonly capabilities: readonly Capability[];
}
```

Rules:

- `id` is a semantic namespace;
- `platform` is exact and closed;
- `implementationIds` are namespaced semantic identifiers;
- every implementation ID is unique;
- every capability is validated by canonical `parseCapability()`;
- duplicate capability identities are rejected;
- resource limits are explicit;
- unknown fields fail closed;
- output is immutable and JSON-round-trippable.

The manifest describes support only. It carries no executable implementation.

### 4.3 Host compatibility requirement

Target shape:

```ts
interface StudioHostCompatibilityRequirement {
  readonly version: "1";
  readonly platform: StudioHostPlatform;
  readonly implementationIds: readonly string[];
  readonly capabilities: readonly Capability[];
}
```

This is a host-scoped compatibility input, not a replacement for planner requirements or canonical Experience semantics.

MASTER-05 can construct this requirement from exact publication/brand/deployment inputs after it selects the host platform. MASTER-04 itself will not resolve deployments or brands.

Rules mirror the manifest:

- exact version;
- exact closed platform;
- canonical semantic implementation IDs;
- canonical protocol capabilities;
- duplicate rejection;
- explicit resource limits;
- immutable parsed output.

### 4.4 Compatibility evaluator

Target API:

```ts
evaluateStudioHostCompatibility(manifest, requirement)
```

Semantics:

1. both inputs are canonically validated first;
2. platform must match exactly;
3. every required implementation ID must exist in the manifest;
4. every required capability identity must exist in the manifest;
5. no `latest`, wildcard, prefix, closest-version or implicit substitution is allowed;
6. valid-but-unsupported requirements produce a deterministic incompatibility result;
7. malformed inputs produce validation failure;
8. no fallback is selected or invented.

Compatibility mismatch reasons should be deterministic and host-scoped, for example:

- `PLATFORM_MISMATCH`;
- `MISSING_IMPLEMENTATION`;
- `MISSING_CAPABILITY`.

The evaluator should preserve deterministic requirement order when returning multiple mismatch reasons, or otherwise use a documented deterministic ordering.

## 5. Resource limits

MASTER-04 will define explicit conservative limits for:

- maximum supported implementation IDs per manifest;
- maximum capabilities per manifest;
- maximum implementation IDs per requirement;
- maximum capabilities per requirement.

Limits must be enforced before expensive iteration where practical.

No unbounded manifest or requirement arrays are allowed.

## 6. Security / trust invariants

The implementation must preserve all of the following:

1. **No executable payloads.** Manifest values are declarative IDs/capabilities only.
2. **No remote code.** URLs, paths, script strings, dynamic imports and renderer callbacks are not contract fields.
3. **Exact identifiers.** No partial/prefix/wildcard support matching.
4. **Exact platform.** A web support declaration does not imply iOS/Android support.
5. **Fail closed.** Missing support returns incompatible; malformed data returns validation failure.
6. **No invented fallback.** Evaluator never manufactures or guesses fallback behavior.
7. **No authorization conflation.** Technical host support does not grant security permission.
8. **No generic planner ownership drift.** Planner capability semantics remain planner-owned.
9. **No Experience schema fork.** Canonical `StudioExperienceDocument` remains unchanged.
10. **No backend/secrets.** Endpoints, tokens, credentials and customer backend details are invalid manifest fields.
11. **No prototype-sensitive dictionary surface.** Prefer arrays + `Set`/`Map` internally over untrusted object-key maps.
12. **Accessor safety.** Contract validation must not evaluate attacker-controlled getters.
13. **Immutable output.** Parsed contract results are frozen deeply enough for their nested arrays/capability entries.

## 7. Expected implementation ownership

Default implementation scope:

```text
packages/studio-host/src/
  capability-manifest.ts or equivalent
  index.ts

tests/contract/
  studio-host-capability-manifest.test.ts
```

If the current `studio-host` source layout makes separate `types.ts` / validator files cleaner, use that existing package convention instead of forcing a single file.

Expected dependency changes:

- ideally none; `studio-host` already depends on `protocol`;
- no dependency on `studio-brand`, `planner`, `security`, renderer packages or runtime packages.

`tooling/package-boundaries.config.mjs` should remain unchanged unless reverse engineering proves the current `studio-host -> protocol` edge is insufficient.

## 8. Focused verification

Focused contract tests must include at least:

### Valid manifest

- web manifest parses;
- iOS manifest parses;
- Android manifest parses;
- output is immutable;
- JSON roundtrip preserves semantics.

### Closed contract / trust boundary

- unknown field rejected;
- endpoint rejected;
- API key/secret field rejected;
- renderer/function-like contract surface rejected;
- accessor-backed input rejected without evaluating the getter;
- URL/path-like implementation IDs rejected through semantic-ID validation.

### Structural validity

- invalid manifest version rejected;
- invalid host ID rejected;
- invalid platform rejected;
- duplicate implementation ID rejected;
- implementation resource limit enforced;
- invalid capability rejected using canonical protocol semantics;
- duplicate capability rejected;
- capability resource limit enforced.

### Requirement validity

- invalid requirement version rejected;
- invalid requirement platform rejected;
- duplicate required implementation rejected;
- duplicate required capability rejected;
- resource limits enforced.

### Compatibility

- exact match => compatible;
- requirement subset of host support => compatible;
- platform mismatch => incompatible;
- one missing implementation => incompatible with deterministic reason;
- one missing capability => incompatible with deterministic reason;
- multiple misses => deterministic mismatch ordering;
- extra host support does not cause failure;
- web implementation support does not satisfy iOS/Android requirement;
- no wildcard/prefix/near-match behavior;
- incompatibility does not emit a fallback or alternate target.

## 9. Repository verification

Before merge:

- focused MASTER-04 tests PASS;
- `pnpm check:boundaries` PASS;
- lint PASS;
- typecheck PASS;
- full test suite PASS;
- build PASS;
- `pnpm verify:all` PASS on exact PR head;
- existing MASTER-02 native conformance remains green;
- existing browser E2E remains green.

## 10. Independent RE / QC gate

Before merge independently re-check:

- no duplicate semantic owner was introduced;
- no Experience/publication/Pack schema was modified without explicit phase ownership;
- no fallback behavior was invented;
- no runtime/renderer/native API leaked into the manifest;
- no security authorization semantics were conflated with technical support;
- no domain/customer branching entered core;
- all IDs use exact canonical syntax;
- resource budgets and duplicate handling fail closed;
- all review threads are resolved;
- branch is 0 behind authoritative `main`;
- exact-head hosted CI is successful;
- final diff is phase-scoped.

Only then: `RE/QC: PASS` and squash merge with an exact-head guard.

## 11. Explicit non-goals

MASTER-04 does not implement:

- generic deployment/Pack/publication resolver;
- instance isolation;
- brand lookup;
- web renderer registry changes;
- iOS SwiftUI renderer;
- Android Compose renderer;
- runtime lifecycle changes;
- Action Boundary;
- authorization policy;
- approvals/challenges;
- fallback authoring schema;
- fallback routing;
- deployment fallback selection;
- customer/domain-specific capabilities;
- Pegasus/airline behavior.

Those belong to later MASTER phases.

## 12. Acceptance gate

MASTER-04 is complete only when all are true:

1. one canonical Host Capability Manifest owner exists in `studio-host`;
2. web/iOS/Android use the same manifest semantics;
3. manifest is declarative and carries no executable code;
4. exact platform/implementation/capability validation is fail closed;
5. host-scoped compatibility requirement is separately validated;
6. compatibility evaluation is deterministic;
7. unsupported requirements are incompatible by default;
8. evaluator exposes no invented fallback behavior;
9. generic protocol, security, planner, Experience and renderer ownership remain unchanged;
10. resource limits and duplicate handling are tested;
11. full repository/browser/native verification passes on exact PR head;
12. independent RE/security/architecture QC passes;
13. branch is 0 behind authoritative main;
14. final diff is phase-scoped;
15. squash merge uses the verified exact head.
