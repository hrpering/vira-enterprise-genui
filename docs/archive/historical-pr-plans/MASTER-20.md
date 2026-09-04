# MASTER-20 — External Brand SDK

Status: CODE-COMPLETE / FINAL-CI-PENDING after phase review.

## Goal

Expose stable customer-facing web, iOS, Android and server entrypoints without creating a second runtime, resolver, registry or policy authority.

## Public shape

```text
Customer
  ├─ Web      → ViraExperience
  ├─ iOS      → ViraExperience
  ├─ Android  → ViraExperience
  └─ Server   → ViraBrandClient
                    ↓
             injected transport
```

## Invariants

- Existing Runtime Web / iOS / Android Host implementations remain authoritative.
- Existing Brand projection/catalog contracts remain authoritative; this phase does not redefine MASTER-03.
- Web façade does not expose `ViraGenUI`, `getSdk()` or an `onReady(sdk)` escape hatch.
- Native façades accept canonical JSON boundaries, decode internally and own runtime-session/surface teardown.
- Native runtime state must belong to the exact mounted Experience before a surface is created.
- Host adapters and native renderer implementations remain explicit trusted customer integration seams; runtime sessions and renderer registries are not customer lifecycle responsibilities.
- Server access is injected through `ViraBrandTransport`; MASTER-20 does not implement the MASTER-21 registry.
- Server request/response envelopes are exact and bounded. Unknown response fields fail closed so registry internals cannot silently become SDK contract.
- No planner, composer, registry, governance or action-boundary implementation is duplicated here.

## Verification scope

Contract coverage checks injected transport ownership, immutable server requests, exact response envelopes, malformed identity rejection and Android package-level availability. Native/full workspace verification is intentionally deferred to the final MASTER-25 local gate requested by the repository owner.
