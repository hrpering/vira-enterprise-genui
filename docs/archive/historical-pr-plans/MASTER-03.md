# MASTER-03 — Brand Integration SDK

## Base

Authoritative base: `ae8cac86ee54d19a7be0d5f76933e4c04c689d6b` (`MASTER-02: portable Experience contract and native conformance (#156)`).

This PR MUST remain based on that exact authoritative `main` until merge-time staleness verification. Any later `main` movement requires reconciliation before merge.

## Goal

Create the developer-facing customer/brand integration facade required by the authoritative master plan without creating a second Brand, Experience, design, policy, component, action, binding, renderer, or publication semantic owner.

Target developer shape:

```ts
defineViraBrand({
  identity,
  design,
  components,
  actions,
  dataSources,
  policies,
  experiences,
});
```

The facade must make a brand integration ergonomic while preserving the existing validated Vira contracts underneath it.

A semantic component identity may map to trusted platform implementation identifiers for `web`, `ios`, and `android`. MASTER-03 records and validates those identifiers; it does not execute native code, resolve arbitrary remote code, or implement host capability negotiation.

## Reverse-engineering findings

### Existing canonical owners

| Concern | Existing owner | MASTER-03 rule |
| --- | --- | --- |
| Brand identity/theme references | `adapter-sdk` `BrandProfile` | Delegate; do not duplicate |
| Brand package composition | `studio-brand` `StudioBrandPackage` / `createStudioBrandPackage()` | Keep canonical composition owner |
| Component semantics/catalog | `studio-catalog` | Delegate; no new component schema |
| Capability → semantic component adapter | `adapter-sdk` `ComponentAdapterContract` | Preserve; not a platform implementation registry |
| Binding/data-source semantics | `studio-binding` | Delegate |
| Action metadata/mapping | `adapter-sdk` `ActionAdapterContract` | Metadata only; no protected execution |
| Composition policy references | `adapter-sdk` `PolicyAdapterContract` | References only; no policy decision engine |
| Experience document semantics | `studio-schema` | Canonical Experience owner unchanged |
| Brand templates | `studio-brand` `StudioBrandTemplate` | `experiences` facade input lowers to these canonical documents/templates |
| Design catalog | `studio-design` | Existing design owner |
| DTCG design compilation | `design-system-compiler` `compileDtcgDesignTokens()` | Delegate instead of adding a token parser |
| JS authoring/runtime renderer activation | `studio-brand-loader` | Keep activation owner; no alternate loader |
| Native host execution/capabilities | future MASTER-04 / MASTER-07B / MASTER-07C | Explicitly out of scope |
| Protected side effects | future MASTER-08 Action Boundary | Explicitly out of scope |
| Governance execution | future MASTER-09 | Explicitly out of scope |

### Existing security/invariant behavior to preserve

`createStudioBrandPackage()` already validates the existing canonical contracts, enforces brand/component identity parity, validates template components/bindings/actions/flow, rejects duplicate template IDs, freezes the result, and rejects unknown backend/secret fields such as `endpoint` and `apiKey`.

`studio-brand-loader` independently revalidates a package, enforces exact renderer-key parity against the active component catalog, rejects non-function/missing/extra JS renderers, and re-parses template instances through the canonical Studio parser.

MASTER-03 must compose around these boundaries, never bypass or fork them.

## Architecture decision

### 1. Extend `studio-brand`; do not create a parallel `brand-sdk` package

The initial implementation SHOULD add a facade/extension surface to `@vira-enterprise-genui/studio-brand` rather than create a new package. A new package is justified only if implementation evidence proves a dependency or ownership boundary that cannot be represented safely inside the existing brand composition owner.

This keeps the dependency graph and semantic ownership simple and follows `PACKAGE_OWNERSHIP.md` guidance to prefer facade/extension over replacement owners.

### 2. `defineViraBrand()` is a lowering/composition facade, not a new validator authority

The facade input is ergonomic. Its output is a validated/frozen definition composed from canonical outputs.

Proposed conceptual output:

```ts
interface ViraBrandDefinition {
  readonly package: StudioBrandPackage;
  readonly design?: CompiledStudioDesignSystem | StudioDesignCatalogOptions;
  readonly policies?: PolicyAdapterContract;
  readonly implementations: StudioBrandPlatformImplementationMap;
}
```

The exact public type may be refined during implementation after dependency-boundary verification, but these ownership rules are fixed:

- `package` MUST be produced by `createStudioBrandPackage()`;
- `design` MUST be produced/validated by an existing design owner;
- `policies` MUST be validated references/metadata, never executable policy logic;
- `implementations` MUST contain only trusted local implementation identifiers/metadata, never executable URLs or arbitrary code.

### 3. Ergonomic input lowering

Target lowering:

```text
identity    → BrandProfile
components  → StudioComponentCatalog
dataSources → StudioBindingSourceCatalog
actions     → ActionAdapterContract
experiences → StudioBrandTemplate[] / StudioExperienceDocument
design      → existing design compiler/catalog path
policies    → existing PolicyAdapterContract/reference path
        ↓
createStudioBrandPackage()
        ↓
validated/frozen canonical package
```

Where ergonomic shorthand is accepted, lowering must be deterministic and lossless relative to the canonical contract. Unknown fields fail closed.

### 4. Trusted cross-platform implementation mapping

MASTER-03 must establish a domain-neutral way for a semantic component reference to declare trusted implementations for all first-class platforms without embedding executable code into the portable Brand/Experience artifact.

Preferred shape is implementation identifiers, for example conceptually:

```ts
{
  "acme.component.offer-card": {
    web: "acme.web.offer-card.v1",
    ios: "acme.ios.offer-card.v1",
    android: "acme.android.offer-card.v1",
  }
}
```

Requirements:

- component keys must match the canonical component catalog exactly;
- implementation IDs must use an existing safe semantic identifier grammar or a narrowly validated identifier grammar, not URLs;
- no `http:`, `https:`, `javascript:`, `data:`, filesystem path, dynamic import expression, source code string, binary blob, or arbitrary executable payload;
- duplicate/missing/extra component mappings fail closed if the mapping is declared complete;
- platform keys are exactly `web`, `ios`, and `android` for this phase;
- actual resolution against a host registry/capability manifest belongs to MASTER-04/07 and must not be invented here.

If the current repository exposes no canonical implementation-ID grammar suitable for this purpose, MASTER-03 may add one narrowly scoped facade-level identifier contract, but it must not become a renderer/runtime owner.

### 5. Design

Do not parse DTCG tokens in `studio-brand`. When the facade accepts raw DTCG design input, it must call `compileDtcgDesignTokens()` and surface the existing compiler result/issues. If the facade instead accepts already-compiled canonical design options, it must validate/use the existing design owner rather than reinterpret them.

Implementation should choose one public path for v1 and avoid ambiguous dual input forms unless tests prove deterministic disambiguation.

### 6. Policies

`policies` in MASTER-03 is declarative metadata/reference wiring only.

Allowed:

- existing `PolicyAdapterContract`/composition policy references;
- exact recipe-to-policy reference validation.

Forbidden:

- Rego/Cedar/custom policy engine execution;
- allow/deny/challenge/transform/approval decisions;
- network policy calls;
- protected action authorization.

Those belong to MASTER-09 and the Action Boundary.

### 7. Actions

`actions` remains the existing `ActionAdapterContract` semantic mapping surface. The facade must not execute an action, call customer endpoints, introduce secrets, approvals, idempotency, concurrency, or side-effect receipts. Those remain MASTER-08 concerns.

## Non-goals

MASTER-03 does NOT:

- create a second Brand schema or second Experience schema;
- replace `StudioBrandPackage` or `createStudioBrandPackage()`;
- replace `studio-brand-loader`;
- add a web renderer/runtime implementation;
- add Swift/SwiftUI or Kotlin/Compose SDK/runtime code;
- implement Host Capability Manifest negotiation;
- implement resolver/deployment/instance selection;
- implement Action Boundary execution;
- implement governance/policy decisions;
- add customer-specific Pegasus, airline, flight, retail, recipe, or other domain switches to core;
- accept raw backend endpoints, API keys, secrets, executable URLs, script strings, iframe/HTML escape hatches, dynamic-import strings, or arbitrary remote code.

## Planned implementation surface

Preferred minimal scope (subject to focused RE while implementing):

- `packages/studio-brand/src/definition.ts` or equivalently named facade implementation;
- additive facade types in `packages/studio-brand/src/types.ts` or a dedicated facade type module;
- `packages/studio-brand/src/index.ts` exports;
- `packages/studio-brand/package.json` only if a real new dependency on `design-system-compiler`, `studio-design`, or policy validation is necessary;
- `tooling/package-boundaries.config.mjs` only for exact dependency edges required by the implementation;
- focused contract tests under `tests/contract/`;
- domain-neutral synthetic fixtures/helpers where useful.

Avoid modifying `studio-brand-loader`, runtime packages, host packages, native interop artifacts, registry/resolver code, or Action Boundary code unless reverse engineering proves an unavoidable contract defect. If that occurs, split the work rather than silently broadening this PR.

## Test strategy

### Facade parity

For equivalent input, `defineViraBrand()` must produce a canonical `StudioBrandPackage` semantically equal to direct `createStudioBrandPackage()` composition.

### Fail-closed canonical delegation

Tests must prove facade input cannot bypass existing failures, including at minimum:

- brand/component `brandId` mismatch;
- unknown component reference in an Experience/template;
- unknown action event in an Experience/template;
- duplicate Experience/template ID;
- invalid binding/data-source reference;
- unknown fields;
- backend endpoint / apiKey / secret-style fields.

Where possible, preserve the existing canonical issue code/path rather than invent a facade-specific replacement.

### Cross-platform implementation metadata

Tests must cover:

- one semantic component mapped to web/iOS/Android implementation IDs;
- multiple components without order-sensitive behavior;
- invalid platform key rejection;
- invalid implementation-ID rejection;
- missing/extra semantic component mapping rejection according to the chosen completeness contract;
- URL/script/path-like implementation value rejection;
- deterministic frozen result.

### Design

If raw DTCG input is supported, prove the facade delegates to `compileDtcgDesignTokens()` and returns/uses the canonical compiled result. Invalid token input must surface canonical compiler failure rather than be partially accepted.

### Policy metadata

Prove policy references are validated through the existing policy contract and remain inert metadata: no executor/callback/network endpoint is accepted.

### Domain neutrality / second synthetic brand

Use at least two materially different synthetic/domain-neutral brands in facade tests (for example catalog/offers and support/case-management) to prove generic core behavior. These fixtures are architecture conformance examples, not customer-specific production packs and do not replace the later MASTER-24 second-brand proof.

Search/diff checks must confirm no new `pegasus`, `airline`, or customer/domain switch enters generic owners.

## Package-boundary rules

- Reuse existing dependencies wherever possible.
- Any new dependency edge must be explicit in both `package.json` and `tooling/package-boundaries.config.mjs`.
- `studio-brand` may depend only on canonical owners necessary to lower/validate facade input.
- `studio-brand` must not gain dependencies on web/runtime/native/registry/control-plane packages in this phase.
- no circular dependency may be introduced.

## Security review checklist

Before merge, independently verify:

- no raw secret/backend connection fields in public facade/output;
- no executable URL/code/dynamic import metadata;
- no prototype-pollution unsafe dictionary operations on untrusted keys;
- exact component/platform mapping, no implicit `latest`/fallback;
- unknown fields fail closed;
- outputs that cross trust boundaries are frozen/immutable like existing brand contracts;
- no customer/domain branching;
- no protected side-effect or policy execution path;
- no renderer/host activation bypass;
- errors do not expose raw secret values.

## Acceptance gate

MASTER-03 is complete only when all are true:

1. Public `defineViraBrand(...)` facade exists in the intended stable package surface.
2. The canonical `StudioBrandPackage` owner and validator remain unchanged in authority; the facade delegates to them.
3. No second Experience/Brand/design/policy/action semantic owner is introduced.
4. The master-plan target inputs `identity`, `design`, `components`, `actions`, `dataSources`, `policies`, and `experiences` have an explicit deterministic ownership/lowering path (optional fields may be intentionally optional only if documented/tested).
5. Semantic component identities can be associated with trusted `web`/`ios`/`android` implementation IDs without embedding executable/remote code.
6. Invalid, missing, extra, URL-like, script-like, or unknown implementation mappings fail closed according to the documented contract.
7. Existing brand/template validation invariants and canonical issue semantics cannot be bypassed through the facade.
8. Design input delegates to the existing design compiler/catalog owner.
9. Policy/action inputs remain metadata only; no protected side effect or governance execution is introduced.
10. At least two synthetic/domain-neutral brand definitions pass without core domain branching.
11. Focused tests cover positive, negative, immutability, determinism, and security cases.
12. Package-boundary validation passes with no unjustified dependency expansion.
13. Full repository verification and browser gate pass on the exact PR head.
14. Independent architecture/security/code-quality RE/QC returns PASS.
15. Immediately before squash merge, authoritative `main`, exact PR head, behind/ahead status, diff hygiene, hosted CI, and unresolved review threads are re-verified.

## Merge discipline

```text
authoritative main ae8cac86ee54d19a7be0d5f76933e4c04c689d6b
        ↓
this written PR plan (first branch commit)
        ↓
focused reverse engineering
        ↓
minimal facade implementation
        ↓
focused contract/security tests
        ↓
independent RE/QC
        ↓
full verify + hosted CI
        ↓
diff hygiene + exact-head freeze
        ↓
squash merge
        ↓
new authoritative main
        ↓
MASTER-04 Host Capability Manifest
```
