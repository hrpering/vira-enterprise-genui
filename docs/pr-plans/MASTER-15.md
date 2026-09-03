# MASTER-15 — AI Authoring v2

## Responsibility

Make Studio AI authoring Brand-aware, requested-platform-aware and policy-metadata-aware while keeping AI strictly draft-only.

```text
Prompt + exact Experience identity
        │
        ├── canonical BrandDefinition
        ├── requested platforms
        ├── exact Host Capability Manifests
        └── optional canonical base document
                 │
                 ▼
       deterministic common surface
        ├── components supported by every requested Host
        ├── per-platform capability snapshots
        ├── Brand binding sources
        ├── Brand action mappings
        └── exact recipe policy references
                 │
                 ▼
             AI provider
                 │
                 ▼
              DRAFT ONLY
                 │
        canonical binding + flow validation
                 │
                 ▼
          StudioExperienceDocument
```

## Invariants

1. Existing `generateStudioDraft()` remains backward compatible.
2. `generateStudioDraftV2()` composes existing canonical BrandDefinition, Host Manifest, component catalog, binding and flow authorities.
3. Requested platforms are an exact unique subset of web/iOS/Android and require exactly one canonical Host manifest each.
4. The AI component catalog is the intersection of Brand platform mappings and implementation IDs supported by every requested Host.
5. Host-local implementation IDs unrelated to the common Brand component surface are never disclosed to the provider.
6. Per-platform capability IDs may be supplied as normalized metadata because the authoritative plan requires capability-aware generation.
7. AI receives canonical Brand action mappings (`event` + `actionType`) but receives no dispatcher/executor.
8. AI receives only policy references for the exact recipe; it never receives a policy engine or permission to override Governance/Core Safety.
9. AI receives no secrets, SecretRef/SecretLease, deployment mutation, Action Boundary executor, publish function or promotion operation.
10. Optional base document must already validate against the common requested-platform surface and exact requested identity.
11. Provider output is a draft and must pass canonical binding/flow validation against the same common surface.
12. A component valid for the Brand but unsupported by any requested Host is reported as `UNSUPPORTED_COMPONENT`.
13. Generated document ID and recipe ID must exactly equal Host-requested identity.
14. AI output cannot publish; publication remains human/product-controlled Studio + MASTER-11 authority.
15. Input/provider trust boundaries reject accessor-backed platform/Host arrays before getter execution.
16. MASTER-15 does not create a model gateway, agent protocol or second Studio document schema.

## RE/QC notes

- the pre-existing `studio-ai` package already owns AI-to-draft generation, so v2 extends it instead of creating another authoring runtime;
- an earlier MASTER-15 branch was based on an obsolete MASTER-14 experiment and carried an alternate preview package. MASTER-15 is clean-ported from authoritative MASTER-14 before review/PR;
- the v2 provider surface exposes exact action mappings rather than only event names, while still withholding execution capability;
- common component calculation uses explicit platform/Host traversal rather than trusting Brand availability alone.

## Verification policy

Hosted CI is deferred. Final local/full CI must cover common-surface intersection, unsupported component rejection, platform mismatch, capability metadata, action mappings, exact policy metadata, immutable provider request, no publish/secret/executor surface, hostile input/provider boundaries and existing v1 Studio AI regression compatibility.
