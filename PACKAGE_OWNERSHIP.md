# Vira Enterprise GenUI Package Ownership

## Purpose

Every semantic concept has one canonical owner. Other packages consume, adapt or project that owner; they do not recreate its schema because another surface needs similar fields.

The executable dependency allowlist remains:

```text
tooling/package-boundaries.config.mjs
```

This document explains responsibility. It does not replace that executable graph and must not drift into a second dependency configuration.

## Ownership rules

1. One semantic contract has one canonical owner.
2. A facade may improve ergonomics but delegates validation/semantics to the owner.
3. A renderer adapts canonical semantics; it does not become the data/schema owner.
4. A provider adapter translates provider concepts into Vira contracts; provider concepts do not leak through unrelated packages.
5. Generic packages do not switch on customer/domain identity.
6. A new package must be registered in the executable package-boundary allowlist.
7. Dependency direction follows ownership; circular ownership is an architecture failure.
8. Experimental/stale branches cannot become a second owner merely by being merged later.

## Current canonical owners

### Foundation

| Package | Canonical responsibility | Must not own |
|---|---|---|
| `protocol` | framework-neutral primitives/contracts shared by foundational layers | React/browser/native platform code; customer domain |
| `runtime-core` | original platform-neutral runtime actions, permissions, lifecycle, patches, reducer/state | browser/React APIs; customer backend; native OS APIs |
| `planner` | Experience planning semantics for the original planning path | DOM/rendering/business API execution |
| `composer` | semantic composition policies over planner/protocol contracts | renderer/backend code |
| `adapter-sdk` | generic integration adapter contract surfaces | customer implementation switching |

### Experience distribution and discovery

| Package | Canonical responsibility | Must not own |
|---|---|---|
| `experience-packs` | Pack identity, version, publisher/metadata, compatibility, artifact/entrypoint manifest contract | Studio document schema; network registry transport; execution |
| `experience-registry` | bounded canonical set of known Pack versions and exact lookup | Pack field grammar; latest-version selection; execution; Marketplace visibility |
| `experience-marketplace` | curated public discovery projection over exact Registry entries | Registry authority; installation/execution; commerce |

### Security and governance foundations

| Package | Canonical responsibility | Must not own |
|---|---|---|
| `security` | existing capability/component/network and related security contracts/evaluators | general provider governance orchestration |
| `policy-engine` | provider-neutral request/decision facade over current security evaluators | Rego/Cedar language; protected action execution |

The future MASTER-09 governance SPI must preserve these existing owners or deliberately migrate them; it must not silently fork current policy/security semantics.

### Telemetry

| Package | Canonical responsibility | Must not own |
|---|---|---|
| `telemetry` | provider-neutral telemetry event/channel/exporter contract | Experience-specific business event ontology |
| `experience-observability` | closed mapping from Experience semantic occurrences into canonical telemetry | exporter/storage/provider transport; arbitrary customer-content logging |

### External protocol normalization

| Package | Canonical responsibility | Must not own |
|---|---|---|
| `tool-bridge` | normalization of supported external tool/provider results into canonical Vira tool result contracts | general wire transport/runtime |
| `protocol-gateway` | closed dispatch to existing protocol/tool normalizers | second Vira protocol; generic JSON-RPC/HTTP runtime |

MASTER-16 may extend protocol integration, but provider wire/runtime concerns remain distinct from canonical Experience/action semantics.

### Web runtime wrappers for original runtime

| Package | Canonical responsibility |
|---|---|
| `runtime-web` | browser/DOM implementation over `runtime-core` and approved adapters/security |
| `web-component` | thin custom-element wrapper over `runtime-web` |
| `react` | thin React wrapper over `runtime-web` |

These packages are web implementations, not the cross-platform semantic source of truth.

### Studio canonical authoring model

| Package | Canonical responsibility | Must not own |
|---|---|---|
| `studio-schema` | `StudioExperienceDocument`, semantic node/view/binding/interaction contract and parser | renderer implementation; customer backend |
| `studio-compiler` | compile canonical Studio document into compiler output | alternate authoring schema |
| `studio-catalog` | semantic component catalog contract | renderer implementation source |
| `studio-design` | validated Studio design semantics/catalog augmentation | product-specific CSS runtime |
| `studio-design-react` | React adaptation of Studio design semantics | core design schema |
| `studio-binding` | binding validation/resolution contracts | external domain state ownership |
| `studio-flow` | interaction/action routing validation semantics | enterprise side-effect execution |
| `studio-publish` | canonical binding → design → flow → compiler publication gate | alternate compiler/publication route |

### Studio authoring/editor surfaces

| Package | Canonical responsibility |
|---|---|
| `studio-authoring` | ergonomic code-first facade delegating to canonical schema/publication/portable-bundle owners |
| `genui-cli` | CLI over `studio-authoring` canonical operations |
| `studio-puck-adapter` | Studio document ↔ Puck editor representation adapter |
| `studio-puck-authoring` | Puck authoring-specific integration over canonical Studio contracts |
| `studio-react` | Studio/Puck React editor representation integration |
| `studio-workbench` | framework-neutral Studio workbench orchestration over canonical authoring contracts |
| `studio-workbench-react` | React workbench surface |
| `studio-ai` | AI drafting against approved Studio contracts/catalogs; not publication authority |
| `studio-lifecycle` | Studio draft/publication lifecycle semantics |

Puck, React and AI are authoring surfaces. None may create an alternate persisted Experience format.

### Brand integration foundations

| Package | Canonical responsibility |
|---|---|
| `studio-brand` | current generic Studio brand bundle/catalog integration contracts |
| `studio-brand-loader` | loading/validating supported Studio brand integration inputs |
| `design-system-compiler` | compilation of approved design-system input into Studio design semantics |

MASTER-03 must reverse-engineer these packages before introducing a public `defineViraBrand(...)` facade. The default expectation is facade/extension, not replacement or duplicate brand schemas.

### Studio runtime and host

| Package | Canonical responsibility | Must not own |
|---|---|---|
| `studio-runtime` | canonical Studio publication execution/session semantics | customer host/backend implementation |
| `studio-runtime-react` | React renderer adapter over canonical Studio runtime | runtime state machine |
| `studio-host` | current validated host bridge, snapshot and action-result contract | renderer or Studio document schema |
| `studio-host-runtime` | canonical bridge from Studio runtime actions/data to host snapshots/dispatch | customer business logic |

`studio-host-runtime` currently owns monotonic host snapshot acceptance and per-session duplicate forward prevention. MASTER-08 may generalize these guarantees but must not create contradictory concurrency semantics.

### Public GenUI web surface

| Package | Canonical responsibility |
|---|---|
| `genui` | public facade composing approved Studio publication, authoring, host/runtime and React consumption |
| `genui-web-component` | SSR-safe custom-element adapter over public `genui` runtime |

These current packages are public web-facing integrations. MASTER-07A will reconcile them with the common Host Contract rather than duplicating them.

## Examples and reference integrations

`examples/*` may contain product/domain-specific demonstrations. They are not canonical generic package owners.

Airline/Pegasus reference code currently demonstrates useful product behavior but must not define generic resolver, runtime, action or schema contracts. MASTER-23 extracts Pegasus into an external brand proof repository.

A test fixture may contain domain language when the test explicitly proves an integration, but generic package source must not branch on those fixture/domain names.

## Planned owners by MASTER phase

The exact package names are intentionally not frozen until their phase reverse engineering is complete. The semantic ownership is frozen.

| Phase | New/extended responsibility | Ownership constraint |
|---|---|---|
| MASTER-02 | portable JSON Schema / Swift / Kotlin generated models + conformance | generated from canonical `studio-schema`; never a new hand-authored semantic schema |
| MASTER-03 | public Brand Integration SDK | extend/facade current Studio brand/catalog/design/action owners; no customer branching in core |
| MASTER-04 | Host Capability Manifest | one platform-neutral capability contract; host-specific data via adapters |
| MASTER-05 | exact generic resolver + instance isolation | consumes Registry/Pack/publication/capability owners; does not own those schemas |
| MASTER-06 | common lifecycle/runtime-kernel evolution | extends `runtime-core`; no browser/iOS/Android APIs in core |
| MASTER-07A | Web Host | adapts common Host Contract to existing web GenUI/React/Web Component/Chat surfaces |
| MASTER-07B | iOS SDK | Swift native host/renderer mapping over canonical generated models/host contracts |
| MASTER-07C | Android SDK | Kotlin/Compose native host/renderer mapping over canonical generated models/host contracts |
| MASTER-08 | Vira Action Boundary | one canonical protected side-effect transaction boundary; reuses existing runtime action/revision foundations |
| MASTER-09 | Governance/identity/approval provider SPI | provider-neutral adapters; does not become Rego/Cedar/AGT clone |
| MASTER-10 | policy simulation | evaluates published/candidate policy semantics; no protected action execution |
| MASTER-11 | artifact/deployment plane | exact immutable deployment ownership; consumes Pack/Registry |
| MASTER-12 | org/project/environment/SecretRef control plane | raw secret resolution remains trusted server concern |
| MASTER-13 | Studio Brand Console | product UI over canonical owners; no new artifact format |
| MASTER-14 | preview orchestration | web approximation + real native host preview; no fake CSS-only native proof |
| MASTER-15 | AI authoring v2 | draft/proposal only; canonical validators and human publish gate remain authority |
| MASTER-16 | protocol integration v2 | adapters to canonical Vira contracts; no protocol-driven bypass |
| MASTER-17 | replay/action ledger | observation/audit; never re-executes side effects |
| MASTER-18 | cross-platform conformance | test owner, not runtime semantic owner |
| MASTER-19 | accessibility/localization semantics | shared semantic requirements with platform-native adapters |
| MASTER-20 | external customer SDK | stable facade hiding internal packages; no duplicate runtime |
| MASTER-21 | enterprise private registry | approved catalog/control-plane projection; preserves Pack/Registry owners |
| MASTER-22 | reusable Experience Packs | domain compositions/templates outside core logic |
| MASTER-23 | Pegasus external repo | airline implementation outside Vira core |
| MASTER-24 | second-brand proof | independent domain proof outside core semantics |
| MASTER-25 | RC gate | verification only; no late architecture shortcut |

## Resolver ownership rule

The generic resolver planned for MASTER-05 may own:

- resolution request validation;
- exact resolution ordering;
- capability compatibility selection;
- exact instance creation/routing metadata.

It may not own:

- Pack validation grammar (`experience-packs`);
- Registry membership (`experience-registry`);
- Studio publication authenticity/runtime compilation (`studio-publish` / `studio-runtime`);
- host capability definition (MASTER-04 owner);
- customer domain adapters (Brand SDK/integration owner);
- enterprise action execution (MASTER-08).

## Action ownership rule

The Action Boundary planned for MASTER-08 owns protected execution orchestration.

It consumes:

- canonical semantic action proposals from runtime/agent adapters;
- identity/governance/approval provider interfaces;
- exact tenant/deployment/instance context;
- trusted action adapters.

It does not become:

- the UI renderer;
- a domain-specific workflow engine;
- the policy language;
- the customer backend;
- the Registry or deployment owner.

## Package creation checklist

Before creating a new package, a phase must answer:

1. Which existing package owns the nearest semantic contract?
2. Why is extension/facade/adaptation insufficient?
3. What exact new responsibility does this package own?
4. Which package is forbidden from duplicating that responsibility afterward?
5. Does the new dependency direction remain acyclic?
6. Is the package generic or explicitly integration/platform-specific?
7. Are customer/domain names absent from generic source?
8. Is the package added to `tooling/package-boundaries.config.mjs` with the minimum necessary dependencies?

If these answers are unclear, the package must not be added yet.

## Drift prevention

A documentation statement cannot change executable package boundaries. Any package-dependency change must update and pass the repository boundary check.

Conversely, if executable dependencies begin to contradict this ownership model, the implementation PR must stop for architecture reconciliation rather than normalizing the drift after the fact.