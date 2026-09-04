# Package Ownership

This document explains ownership; it does not define executable dependency policy.

**Executable authority:** `tooling/package-boundaries.config.mjs`  
If this document and the executable boundary graph disagree, the executable graph wins and this document must be corrected.

## Current canonical owners

The repository already contains canonical owners for the current Enterprise GenUI foundation. Future phases must consume or extend these owners rather than recreate them.

| Concern | Canonical owner / family |
|---|---|
| Runtime state, lifecycle, patches, permissions, errors | `runtime-core` |
| Protected effect boundary | `action-boundary` |
| Governance semantics | `governance`, `enterprise-governance` |
| Enterprise scoped context | `enterprise-context` |
| Enterprise/private registry concerns | `enterprise-registry` |
| Publication/deployment concerns | `deployment-plane` |
| Experience resolution | `experience-resolver` |
| Experience Pack semantics | `experience-packs` |
| Experience registry | `experience-registry` |
| Action receipts / ledger | `action-ledger` |
| Protocol adaptation | `protocol-gateway` |
| Studio document schema | `studio-schema` |
| Studio publication gate | `studio-publish` |
| Human Studio authoring | `studio-workbench` |
| Studio AI proposal surface | `studio-ai` |
| Web/native render/host surfaces | existing runtime and Studio host/renderer packages governed by the executable boundary graph |

This table is intentionally descriptive and non-exhaustive. New dependencies must satisfy `pnpm check:boundaries`.

## Future ownership constraints

Planned Application Network phases introduce semantics only after reverse engineering proves the nearest existing owner cannot express them cleanly.

- `ViraApplicationPackage` is a higher-order distribution unit that references existing Experience, Experience Pack, Studio publication, brand, action and governance identities. It does not replace them.
- `CapabilityDefinition` is provider-neutral. MCP, customer APIs, hosted Vira execution and SaaS vendors are bindings/providers, not semantic owners.
- `WorkContext` is bounded work state and provenance; it is not chat history, user memory, prompt dump or agent-framework state.
- `ApplicationGraph` owns application-semantic nodes/edges, not Canvas coordinates, zoom, selection or other editor projection state.
- Canvas may author/propose semantics but cannot become runtime, publication, governance or protected-action authority.
- Distribution/Network may discover and resolve packages/capabilities but cannot become execution authority.
- Entitlement expresses commercial access. It is distinct from authorization, governance and runtime permission.
- Protocol projections report lossless/lossy/unsupported explicitly; adapters never silently redefine canonical semantics.

## Change rule

Before adding a package or semantic noun, a phase must record:

1. the nearest current owner,
2. why extending it is insufficient,
3. permitted dependency edges,
4. invariants and failure semantics,
5. focused and repository-level verification.
