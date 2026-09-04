# MASTER-15 — AI Authoring v2

## Responsibility

Make Studio AI authoring Brand-aware, universally cross-platform and policy-metadata-aware while keeping AI strictly draft-only.

```text
Prompt + exact Experience identity
        │
        ├── canonical BrandDefinition
        ├── web + iOS + Android
        ├── exact Host Capability Manifest for each peer Host
        └── optional canonical base document
                 │
                 ▼
       deterministic universal surface
        ├── components supported by all three Hosts
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

1. Existing `generateStudioDraft()` remains backward compatible for legacy/specialized authoring.
2. `generateStudioDraftV2()` composes existing canonical BrandDefinition, Host Manifest, component catalog, binding and flow authorities.
3. V2 requires exactly the three peer platforms `web + ios + android`; subsets cannot widen the generated catalog surface.
4. Caller platform/Host ordering is normalized to deterministic `web → ios → android` provider context.
5. Exactly one canonical Host Capability Manifest is required for each of web, iOS and Android.
6. The AI component catalog is the intersection of Brand platform mappings and implementation IDs supported by all three Hosts.
7. Host-local implementation IDs unrelated to the universal Brand component surface are never disclosed to the provider.
8. Per-platform capability IDs are supplied as normalized metadata because the authoritative plan requires capability-aware generation.
9. AI receives canonical Brand action mappings (`event` + `actionType`) but receives no dispatcher/executor.
10. AI receives only policy references for the exact recipe; it never receives a policy engine or permission to override Governance/Core Safety.
11. AI receives no secrets, SecretRef/SecretLease, deployment mutation, Action Boundary executor, publish function or promotion operation.
12. Optional base document must already validate against the universal component surface and exact requested identity.
13. Provider output is a draft and must pass canonical binding/flow validation against the same universal surface.
14. A component valid for the Brand but unsupported by any one of web/iOS/Android is reported as `UNSUPPORTED_COMPONENT`.
15. Generated document ID and recipe ID must exactly equal Host-requested identity.
16. AI output cannot publish; publication remains human/product-controlled Studio + MASTER-11 authority.
17. Input/provider trust boundaries reject accessor-backed platform/Host arrays before getter execution.
18. MASTER-15 does not create a model gateway, agent protocol or second Studio document schema.

## RE/QC findings closed

- the pre-existing `studio-ai` package already owns AI-to-draft generation, so v2 extends it instead of creating another authoring runtime;
- an earlier MASTER-15 branch was based on an obsolete MASTER-14 experiment and carried an alternate preview package. MASTER-15 is clean-ported from authoritative MASTER-14 before review/PR;
- the first v2 draft allowed a 1..3 platform subset; the authoritative plan requires the catalog surface common to all three peer Hosts, so v2 now requires exactly web+iOS+Android;
- platform input order is canonicalized so equivalent requests produce the same provider context ordering;
- the provider surface exposes exact action mappings rather than only event names, while still withholding execution capability;
- common component calculation uses explicit platform/Host traversal rather than trusting Brand availability alone.

## Verification policy

Hosted CI is deferred. Final local/full CI must cover universal three-Host intersection, subset rejection, unsupported component rejection, Host mismatch, canonical platform ordering, capability metadata, action mappings, exact policy metadata, immutable provider request, no publish/secret/executor surface, hostile input/provider boundaries and existing v1 Studio AI regression compatibility.
