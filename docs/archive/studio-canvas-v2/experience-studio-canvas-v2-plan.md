# Experience Studio Canvas v2 master plan

## Product invariant

Experience Studio is a brand-package-driven GenUI authoring platform connected to Vira through one host boundary. The airline implementation is a reference implementation only.

A new customer must not require project-name switches or core Studio code changes. The customer supplies an approved brand package and trusted renderer implementation; Vira supplies state, domain data, actions, and runtime updates through one host bridge.

```text
Customer backend / tools / agents
            |
           Vira
            |
     Studio Host Bridge
      /      |       \
   state   domain   actions
            |
     Experience Studio
            |
      Brand Package
   /      |      |      \
components data actions templates
```

Puck remains an editor engine. `StudioExperienceDocument` remains the canonical persisted format.

## Non-negotiable architecture rules

1. Core Studio packages contain no airline, banking, retail, or customer-name branching.
2. A brand package never contains backend URLs, API keys, secrets, fetch clients, or direct backend calls.
3. Brand components emit declared Studio events. Canonical actions cross the Vira host boundary.
4. Runtime/domain data is hydrated into preview/runtime state and is never silently persisted into the authored document.
5. Templates are editable `StudioExperienceDocument` graphs, not aliases for one opaque runtime component.
6. Puck data is an editor representation only and must round-trip through the Studio adapter.
7. Opaque functional widgets remain supported when a brand intentionally locks internals, but composable components expose slots/props/events explicitly.
8. Dynamic collections use a canonical repeater/data-scope model. Runtime records do not become authored canvas nodes.
9. Every package, template, binding, action mapping, and publish path validates fail-closed.
10. Existing published Studio documents remain supported or receive an explicit migration path.

## Reverse-engineering baseline

The current repository already has useful foundations:

- `studio-schema` supports nested nodes through `parentId` and `slot`.
- `studio-puck-adapter` recursively exports/imports inline slot children.
- `studio-workbench-react` already exposes Components, Layers, Views, Data, Actions, center Preview, and Properties surfaces.
- `studio-design` already defines color/background/typography/spacing/radius/shadow/alignment/width/layout controls.
- `studio-binding` already validates scalar `state` and `domain` bindings.
- `studio-flow` already validates component events against an Action Adapter.
- `adapter-sdk` already owns brand profile and action adapter contracts.

The principal authoring gap is not the absence of Puck. Rich airline surfaces are registered with `slots: []` and mounted as opaque DOM islands. Starter templates therefore commonly contain one root domain component. Puck cannot select or edit the internal card/title/price/button hierarchy because that hierarchy does not exist in the canonical Studio node graph.

A second gap is dynamic data composition: binding value types are currently scalar only (`string`, `number`, `boolean`, `enum`), so there is no canonical array/object/current-item scope for editable repeated results.

## Phase 0 — Stabilization baseline

Scope: PR #114.

Acceptance:

- `pnpm verify:all` passes locally on the authoritative PR head.
- shared mock airline domain behavior remains deterministic.
- authoring and published interaction lifecycle tests stay green.
- no Canvas v2 work is merged into the stabilization PR.

## Phase 1 — Brand package + Vira host foundation

Deliverables:

- `studio-brand`: framework-agnostic declarative package composing existing Brand Profile, Component Catalog, Binding Source Catalog, Action Adapter, and editable template documents.
- cross-contract validation: brand id parity, unique templates, template component validity, binding validity, and action-flow validity.
- `studio-host`: the single Vira connection contract for state/domain snapshots, action dispatch, and subscriptions.
- strict schemas reject undeclared fields such as endpoints or API keys.
- package-boundary rules and contract tests.

Quality gate:

- boundary check
- lint
- TypeScript 6 strict typecheck
- contract/unit tests
- root build

## Phase 2 — Canvas primitives and nested authoring

Deliverables:

- approved generic primitives: Stack, Row, Grid, Card, Heading, Text, Button, Badge, Price, Divider, Image/Icon where policy allows.
- real slot-based nesting in Puck.
- add, delete, duplicate, reorder, move, and nested drag/drop operations round-trip to `StudioExperienceDocument`.
- Layers mirrors the canonical node graph.

Reverse-engineering checks:

- prove each Puck operation has a canonical Studio mutation equivalent.
- identify unsupported Puck metadata and continue rejecting it fail-closed.
- verify node identity remains stable across save/reload.

Quality gate:

- nested graph round-trip property tests
- drag/drop E2E
- save/reload E2E
- no Puck-only persisted state

## Phase 3 — Inspector v2 + design system authoring

Deliverables:

Right inspector tabs:

- Content
- Design
- Data
- Actions

Design controls are generated from approved catalog/design metadata, not arbitrary CSS. Brand tokens are the default source of color/typography/radius/spacing choices. Raw script/style injection remains forbidden.

Quality gate:

- design validation tests for every control
- brand-token allowlist tests
- authoring/runtime visual parity E2E
- accessibility checks for editor controls

## Phase 4 — Data model v2: collections and scopes

Deliverables:

- binding types for arrays and objects without weakening scalar validation.
- canonical `Repeat` / collection node semantics.
- scoped `currentItem` and optional `index` binding context.
- collection item schema/field metadata so the editor can offer valid child bindings.
- Conditional/Data Scope primitives if needed by the vertical slice.

Example:

```text
domain.results.offers[]
        |
      Repeat
        |
 currentItem
   /   |    \
 time price offerId
```

Quality gate:

- scope escape attempts rejected
- item bindings type checked
- empty/one/many collection tests
- runtime data never expands the authored node count

## Phase 5 — Action payload bindings

Deliverables:

- event -> canonical Vira action remains controlled by the Action Adapter.
- authorable payload mappings from literals, state, domain, and current-item scope.
- required payload validation.
- host/runtime permission enforcement remains authoritative.

Example:

```text
Button.onClick
  -> travel.flight.offer.select
     offerId <- currentItem.id
```

Quality gate:

- undeclared action rejected
- undeclared payload source rejected
- prototype/accessor/non-JSON input rejected
- permission denial does not mutate UI as success

## Phase 6 — Flight Results vertical slice

This is the first proof that Canvas v2 is a product rather than a template viewer.

Replace the opaque Flight Results starter with an editable graph such as:

```text
Stack
|- SearchSummary
|- Heading
|- Repeat: domain.results.offers
|  `- FlightCard
|     |- Route/Times
|     |- Price
|     |- Badge
|     `- Button
`- Notice
```

The author must be able to change copy, layout, card styling, price styling, button label/position, remove optional nodes, bind live mock-domain fields, and publish without code changes.

Acceptance:

- three mock offers render from one authored card template.
- changing mock-domain input changes data, not document structure.
- selected offer action crosses the Vira host bridge.
- save/reload/publish preserves all authored changes.

## Phase 7 — Airline reference kit decomposition

Migrate remaining reference experiences deliberately:

- Flight Search
- Fare Comparison
- Traveller Details
- Seat Selection
- Baggage
- Extras
- Booking Review
- guidance experiences

Use a hybrid rule:

- composable presentation is exposed as editable nodes/slots;
- complex safety/business logic may remain inside a functional component;
- each brand explicitly declares what is editable and what is locked.

No airline-specific behavior enters core Studio packages.

## Phase 8 — Brand onboarding and switching

Deliverables:

- load one validated active brand package into the Studio session.
- component panel/categories derive entirely from the active package.
- templates derive entirely from the active package.
- trusted renderer registry is checked for exact catalog parity.
- brand switching cannot leak nodes, data sources, actions, tokens, or renderer state between brands.

Acceptance reference kits:

- airline kit
- a second minimal non-airline kit used only to prove genericity

The second kit should exercise different component names/categories without adding a core switch statement.

## Phase 9 — Publish/runtime parity and Vira integration

Deliverables:

- Studio authoring host and published runtime consume the same host contract.
- published document resolves bindings and actions through Vira only.
- host completion/empty/error outcomes drive declared routes.
- optimistic UI is allowed only where the component contract explicitly supports rollback.

Quality gate:

- authoring vs published parity suite
- success/empty/error routing
- reconnect/subscription lifecycle
- cancellation and stale-revision protection
- no direct customer backend access from Studio or brand package

## Phase 10 — Enterprise hardening

Deliverables:

- migration/versioning policy for Brand Package, StudioDocument, data scopes, and action payload bindings.
- import/export validation and size limits.
- audit/telemetry hooks without customer secret capture.
- accessibility and keyboard authoring pass.
- performance budgets for large documents and collections.
- malicious brand-package fixtures.
- customer onboarding documentation and reference package template.

Release gate:

- `pnpm verify:all`
- package boundary graph green
- no secrets/endpoints in reference package manifests
- two-brand genericity test
- save/reload/publish/runtime E2E
- backward-compatibility fixtures
- diff hygiene review

## PR discipline

Each phase uses a small branch from the latest authoritative base. A PR must not mix stabilization, customer-specific implementation, and core contract changes.

Recommended sequence:

1. Canvas v2 / Brand + Host Foundation
2. Canvas v2 / Composable Primitives
3. Canvas v2 / Inspector
4. Canvas v2 / Collection Bindings
5. Canvas v2 / Action Payload Bindings
6. Canvas v2 / Flight Results Vertical Slice
7. Canvas v2 / Airline Kit Migration
8. Canvas v2 / Brand Loader and Switching
9. Canvas v2 / Host Runtime Integration
10. Canvas v2 / Enterprise Release Gate

No phase is considered complete from code review alone. The phase-specific test gate and the repository-wide local verification gate must pass before merge.
