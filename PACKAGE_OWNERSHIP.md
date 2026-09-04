# Package Ownership

This document explains ownership; it does not define executable dependency policy.

**Executable authority:** `tooling/package-boundaries.config.mjs`  
If this document and the executable boundary graph disagree, the executable graph wins and this document must be corrected.

## Current canonical owners

| Concern | Canonical owner / family |
|---|---|
| Application release identity/reference graph/distribution metadata | `application-package` |
| Application semantic nodes/edges | `application-graph` |
| Canvas draft identity/editor revision/non-semantic projection + mutation session | `application-canvas` |
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
| Studio publication gate | `studio-publish` |
| Human Studio authoring inside one Experience | `studio-workbench` |
| Studio AI proposal surface | `studio-ai` |
| Web/native render/host surfaces | existing runtime and Studio host/renderer packages governed by the executable boundary graph |

`application-canvas` depends only on `application-package`, `application-graph` and `protocol`. It delegates semantic parsing to the first two owners and keeps graph layout/viewport/selection outside canonical semantics.

Canvas mutation/session APIs remain in the same owner. They may hold an in-memory canonical draft, require exact `expectedRevision`, atomically revalidate candidates and increment `editorRevision`, but they do not acquire runtime/publication/deployment/governance/Action authority.

Canvas `editorRevision` is editor metadata only. It cannot be substituted for Application release version, deployment revision, runtime state revision or ledger ordering.

## Future ownership constraints

- Canvas mutation/session layers must call canonical Application/Graph/Canvas parsers after semantic edits instead of maintaining parallel schemas.
- Stale Canvas writes must fail closed; failed mutation candidates cannot partially commit.
- Canvas UI/render libraries may project editor state but cannot redefine semantic nodes/edges based on coordinates.
- Provider bindings must map to exact provider-neutral semantics and remain outside Canvas draft authority.
- WorkContext remains bounded work state/provenance, not chat history, user memory or prompt dump.
- Distribution/Network may discover and resolve packages/capabilities but cannot become execution authority.
- Entitlement expresses commercial access and remains distinct from authorization/governance/runtime permission.
- Protocol projections report lossless/lossy/unsupported explicitly; adapters never silently redefine canonical semantics.

## Change rule

Before adding a package or semantic noun, a phase must record the nearest owner, why extending it is insufficient, permitted dependency edges, invariants/failure semantics, and focused/repository verification.
