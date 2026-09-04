# Package Ownership

This document explains ownership; it does not define executable dependency policy.

**Executable authority:** `tooling/package-boundaries.config.mjs`  
If this document and the executable boundary graph disagree, the executable graph wins and this document must be corrected.

## Current canonical owners

| Concern | Canonical owner / family |
|---|---|
| Application release identity/reference graph/distribution metadata | `application-package` |
| Application distribution envelope + artifact-integrity binding | `application-distribution` |
| Application semantic nodes/edges | `application-graph` |
| Canvas draft identity/editor revision/non-semantic projection + mutation session | `application-canvas` |
| Application-level Canvas AI semantic proposal/diff | `application-canvas-ai` |
| Canvas dry-run semantic path trace + exact replay | `application-canvas-simulation` |
| Canvas authoring collaboration/presence/semantic peer review | `application-canvas-collaboration` |
| Canvas external design source provenance + authoring import artifact | `application-canvas-design-import` |
| DTCG design-token compilation into Studio design options | `design-system-compiler` |
| Studio design catalog controls/options | `studio-design` |
| Full Studio brand definition/package assembly | `studio-brand` |
| Trusted Studio brand renderer activation | `studio-brand-loader` |
| Provider-neutral CapabilityDefinition semantics | `capability-contract` |
| Bounded WorkContext definition/snapshot/provenance semantics | `work-context` |
| Capability wire/protocol identity envelope | `protocol` |
| Runtime state, lifecycle, patches, permissions, errors | `runtime-core` |
| Protected effect boundary + Action effect/idempotency catalog | `action-boundary` |
| Governance semantics | `governance`, `enterprise-governance` |
| Policy evaluator simulation | `policy-simulation` |
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
| Experience-level Studio AI proposal surface | `studio-ai` |
| Web/native render/host surfaces | existing runtime and Studio host/renderer packages governed by the executable boundary graph |

`application-distribution` depends only on `application-package` and `protocol`. It owns the strict provider-neutral distribution envelope, exact SHA-256 integrity identity, deterministic envelope serialization around canonical Application serialization, and the explicit fail-closed integrity-verification gate. It does not own Application discovery metadata, compatibility, protocol projections, commercial semantics, registry persistence, transport/URLs, provider credentials, deployment/runtime, governance/authorization or execution.

`application-canvas` remains the only owner of Canvas editor revision and atomic draft mutation. Collaboration final apply delegates to its mutation session rather than replacing or duplicating stale-write/canonical validation logic.

`application-canvas-ai` remains proposal-only and provider-facing. `application-canvas-collaboration` is provider-neutral, so human or AI-originated candidate semantics can be reviewed without granting AI apply authority.

`application-canvas-simulation` remains dry-run authoring evidence only and is independent from collaboration approval state.

`application-canvas-collaboration` depends only on `application-canvas` and `protocol`. It owns registered collaborator envelopes, per-actor ephemeral presence, concurrent semantic proposals, immutable peer-review records, authoring approval thresholds and stale-safe apply delegation. It does not own CRDT/network transport, persistence, governance/authorization, publication/deployment or runtime/protected execution.

`application-canvas-design-import` depends only on `application-canvas`, `design-system-compiler` and `protocol`. It owns strict provider-neutral DTCG import envelopes, bounded external source provenance, exact current Application brand binding and the frozen authoring import artifact. It delegates token semantics and compilation to `design-system-compiler` and does not own vendor payload parsing, network transport, credentials, full brand assembly, renderer installation, Canvas mutation, publication/deployment or runtime execution.

`design-system-compiler`, `studio-design`, `studio-brand` and `studio-brand-loader` remain the canonical design/brand owners. MASTER-36 does not duplicate their schema or activation responsibilities.

Presence is non-semantic editor state and never increments `editorRevision`. Semantic review approval is only permission to mutate the local Canvas draft; it is not enterprise governance or authorization.

Canvas `editorRevision` remains editor metadata only and cannot substitute for Application release version, deployment revision, runtime state revision or ledger ordering.

## Future ownership constraints

- Application Network registry/catalog/federation layers must consume `application-distribution` envelopes rather than define a second Application artifact format.
- Distribution may expose/index metadata already owned by `application-package`, but it must not silently fork or mutate those values.
- Distribution integrity verification is not deployment approval, governance approval, entitlement or execution permission.
- Network transports/providers may carry a distribution envelope but must not become canonical Application semantic owners.
- External design adapters may normalize Figma/Sketch/vendor sources to DTCG, but provider formats/URLs/credentials must not become canonical Canvas design semantics.
- Canvas design import artifacts must bind an existing exact Application `brandRef`; no implicit/latest brand resolution.
- Imported design artifacts are authoring data only and cannot directly install renderers, mutate Canvas semantics, publish, deploy or execute.
- Design token compilation must continue to delegate to `design-system-compiler`; Canvas must not fork DTCG rules.
- Collaboration/network transports must carry authoring contracts rather than redefine semantic truth.
- Presence/cursors/selections must remain ephemeral and outside Application semantics.
- Stale collaboration proposals must fail closed after any competing Canvas mutation changes `editorRevision`.
- Collaboration review must not become publication, deployment, governance or protected Action authority.
- Canvas mutation/session layers must call canonical Application/Graph/Canvas parsers after semantic edits instead of maintaining parallel schemas.
- Canvas AI must remain proposal-only.
- Canvas simulation/replay must remain authoring-time dry-run evidence.
- Provider bindings must map to exact provider-neutral semantics and remain outside Canvas draft authority.
- WorkContext remains bounded work state/provenance, not chat history, user memory or prompt dump.
- Distribution/Network may discover and resolve packages/capabilities but cannot become execution authority.
- Entitlement expresses commercial access and remains distinct from authorization/governance/runtime permission.

## Change rule

Before adding a package or semantic noun, a phase must record the nearest owner, why extending it is insufficient, permitted dependency edges, invariants/failure semantics, and focused/repository verification.
