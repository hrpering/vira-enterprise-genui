# MASTER-22 — Experience Packs

Status: CODE-COMPLETE / FINAL-CI-PENDING after phase review.

## Goal

Provide reusable product/domain flow compositions and optional policy references without changing the existing deployment `ExperiencePackManifest` contract or moving product semantics into Runtime Core.

## Authority split

```text
Reusable domain content
  ├─ canonical StudioExperienceDocument
  └─ optional provider + policyRef metadata
              ↓
Experience Pack composition
              ↓ author/publish path
existing publication / deployment Pack authorities
```

## Invariants

- Existing `experience-packs` remains the deployment artifact manifest authority (`publisher/name`, artifacts, entrypoints, compatibility).
- MASTER-22 does not add product/domain branching to runtime, resolver, governance or action execution.
- Reusable flow content is a canonical `StudioExperienceDocument`; validation delegates to `parseStudioExperienceDocument`.
- Composition identity and domain are semantic namespaces.
- Policy templates are references only: exact `id`, `provider`, `policyRef`.
- No policy body, Rego/Cedar source, script, executable payload or generic parameters are carried in composition metadata.
- Policy providers remain authoritative for policy evaluation and policy content.
- Policy template identities are unique and bounded.
- The parsed composition and policy template list are immutable.

## Verification scope

Focused contract coverage checks canonical flow composition, provider-neutral policy references, rejection of executable policy fields, canonical Studio validation delegation and duplicate policy-template denial. Full publication/deployment and domain proof verification is intentionally deferred to the final MASTER-25 local gate.
