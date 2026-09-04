# Package Ownership

This document explains ownership; it does not define executable dependency policy.

**Executable authority:** `tooling/package-boundaries.config.mjs`  
If this document and the executable boundary graph disagree, the executable graph wins and this document must be corrected.

## Current canonical owners

| Concern | Canonical owner / family |
|---|---|
| Application release identity/reference graph/distribution metadata | `application-package` |
| Application semantic graph nodes/edges/relations | `application-graph` |
| Provider-neutral CapabilityDefinition semantics | `capability-contract` |
| Bounded WorkContext definition/snapshot/provenance semantics | `work-context` |
| Capability wire/protocol identity envelope | `protocol` |
| Runtime state, lifecycle, patches, permissions, errors | `runtime-core` |
| Protected effect boundary + Action effect/idempotency catalog | `action-boundary` |
| Governance semantics | `governance`, `enterprise-governance` |
| Enterprise organization/project/environment/principal/secret scope | `enterprise-context` |
| Enterprise/private registry concerns | `enterprise-registry` |
| Publication/deployment concerns | `deployment-plane` |
| Experience resolution | `experience-resolver` |
| Experience Pack semantics | `experience-packs` |
| Experience registry | `experience-registry` |
| Action receipts / ledger truth | `action-ledger` |
| Protocol adaptation | `protocol-gateway` |
| Studio document schema | `studio-schema` |
| Studio interaction/view/event flow | `studio-flow` |
| Studio publication gate | `studio-publish` |
| Human Studio authoring | `studio-workbench` |
| Studio AI proposal surface | `studio-ai` |
| Web/native render/host surfaces | existing runtime and Studio host/renderer packages governed by the executable boundary graph |

`application-package`, `capability-contract`, `work-context` and `application-graph` each depend only on `protocol` in the current semantic foundation.

`application-graph` owns immutable application-semantic membership/relations only. It does not own planner directives, workflow scheduling, runtime state, Studio interaction routing, Canvas projection state, provider bindings or protected Action execution.

MASTER-27 `application-package.flows[]` remains an exact reference list; MASTER-30 defines the canonical ApplicationGraph release payload those refs may target without changing the v1 Application Package wire shape.

## Future ownership constraints

- Provider bindings must map to an exact `CapabilityDefinition` and fail explicitly when mapping is unsupported/lossy.
- WorkContext remains bounded work state/provenance; it is not chat history, memory, prompt or agent scratchpad state.
- ApplicationGraph remains semantic nodes/edges; it is not Canvas coordinates, scheduler state or runtime truth.
- Canvas may author/propose semantics but cannot become runtime, publication, governance or protected-action authority.
- Distribution/Network may discover and resolve packages/capabilities but cannot become execution authority.
- Entitlement expresses commercial access. It is distinct from authorization, governance and runtime permission.
- Protocol projections report lossless/lossy/unsupported explicitly; adapters never silently redefine canonical semantics.

## Change rule

Before adding a package or semantic noun, a phase must record:

1. nearest current owner,
2. why extending it is insufficient,
3. permitted dependency edges,
4. invariants and failure semantics,
5. focused and repository-level verification.
