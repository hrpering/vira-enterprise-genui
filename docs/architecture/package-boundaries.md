# Package boundaries

This document is a human-readable architecture guide. The **executable dependency authority** is `tooling/package-boundaries.config.mjs`; when this guide and the executable graph differ, the graph wins and this document must be corrected.

## Directional rule

Dependencies point toward stable semantic owners, never back toward framework-, host-, provider- or customer-specific implementations.

Representative current owners include:

| Concern | Canonical owner / family | Must not become |
| --- | --- | --- |
| Versioned base contracts | `protocol` | renderer/provider/customer implementation |
| Runtime state/actions/lifecycle | `runtime-core` | DOM/UIKit/Compose or customer backend |
| Planning/composition | `planner`, `composer` | protected business execution |
| Original adaptation surfaces | `adapter-sdk`, `tool-bridge` | runtime or canonical action authority |
| Web rendering/wrappers | `runtime-web`, `react`, `web-component` | semantic/runtime duplication |
| Studio authoring/publication | `studio-schema`, `studio-publish`, `studio-workbench`, related compiler/binding/design/flow owners | second runtime or second Experience schema |
| Experience distribution | `experience-packs`, `experience-registry`, `experience-resolver`, `deployment-plane` | implicit-latest execution |
| Protected effects | `action-boundary`, `action-ledger` | renderer/provider bypass path |
| Governance/context | `governance`, `enterprise-governance`, `enterprise-context` | provider-specific canonical semantics |
| Enterprise distribution | `enterprise-registry` | Experience/Pack semantic duplication |
| Protocol adaptation | `protocol-gateway` | canonical application semantics |
| Native parity | `cross-platform-conformance`, `native-ux-gate`, `sdk/ios`, `sdk/android` | forked platform semantic schemas |
| Security/policy support | `security`, `policy-engine`, `policy-simulation` | a new policy language or execution bypass |

This list is descriptive, not an exhaustive allowlist. New/changed edges are accepted only if `pnpm check:boundaries` accepts the executable workspace graph.

## Core invariants

- `protocol` and other low-level semantic owners do not depend on renderer/framework layers.
- `runtime-core` stays platform neutral.
- renderer/wrapper packages do not own planning, governance or protected-action semantics.
- provider/customer/domain integrations do not become dependencies of generic canonical owners.
- Studio/editor packages do not become runtime authority.
- protocol adapters project/normalize semantics; they do not redefine them.
- protected enterprise effects converge on `action-boundary`/governance owners rather than direct host or renderer networking.
- exact version/instance/tenant semantics are explicit; no implicit-latest or global-active fallback edge is introduced.

## Future Application Network rule

MASTER-26+ may add an owner only after reverse engineering shows the nearest existing owner cannot express the new semantic responsibility. Canvas and Network packages must consume existing Experience/runtime/action/governance authorities rather than invert dependency direction or duplicate them.
