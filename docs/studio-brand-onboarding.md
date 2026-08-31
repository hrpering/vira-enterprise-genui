# Studio Brand onboarding

## Goal

A customer integrates with Experience Studio by supplying one validated Studio Brand Package and trusted renderer registries. Core Studio must not be edited for a customer name, vertical, backend URL, or deployment.

## Package checklist

1. Define a semantic Brand Profile with approved token references only.
2. Define the Component Catalog: explicit props, slots, events, and optional typed event payload fields.
3. Define Binding Sources for approved state/domain values. Collection item bindings use `currentItem.*` scope sources.
4. Define the Action Adapter mapping brand events to canonical Vira action types.
5. Provide editable Studio template documents. Dynamic data uses `repeat`; runtime records are never copied into the authored node graph.
6. Provide exact trusted authoring and runtime renderer registries. Every catalog component must have one renderer and extra renderers are rejected.
7. Activate through `studio-brand-loader`.
8. Connect Vira/customer state, domain data, actions and subscriptions through `StudioHostBridge` plus `studio-host-runtime`.

## Forbidden package content

Brand packages must not contain API keys, secrets, backend URLs, HTTP headers, fetch clients, arbitrary HTML/JavaScript/CSS, executable callbacks, or customer-specific runtime switches.

## Publish requirements

Before publication, the document must pass schema, catalog, binding, flow and publication validation. Required action payload fields must be mapped. Scope bindings must remain inside their repeat context.

## Portability

Use the versioned Studio portable bundle for import/export. It contains only brand identity and a canonical Studio document, is bounded to 1 MiB, and never contains renderer registries or backend connection material. Unsupported future versions fail closed until an explicit deterministic migration is implemented.

## Acceptance

For a new brand, prove:

- package validation
- renderer parity
- template creation and save/reload
- authoring/runtime visual parity
- state/domain binding behavior
- canonical action dispatch and success/empty/error routing
- no cross-brand component/template/data/action leakage
- `pnpm verify:all` on the authoritative stack head
