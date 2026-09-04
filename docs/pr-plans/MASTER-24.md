# MASTER-24 — Second Brand Proof

Status: CODE-COMPLETE / FINAL-CI-PENDING after phase review.

## Goal

Prove the governed experience architecture with a materially different synthetic retail return/refund domain without adding retail-specific branches to Vira core.

## Proof path

```text
Retail return/refund composition
        ↓
canonical StudioExperienceDocument
        ↓
same ActionIntent on Web / iOS / Android
        ↓
provider-neutral Governance pipeline
        ↓
Action Boundary write execution
        ↓
canonical receipt + revision/idempotency
        ↓
Cross-platform semantic conformance
```

## Invariants

- Retail semantics exist only in proof fixtures/docs, not in `packages/` or native SDK implementation branches.
- Reusable retail flow content is validated by the existing MASTER-22 composition authority.
- Web, iOS and Android governance evaluations consume the same exact canonical ActionIntent.
- Governance provider output is domain data only; governance pipeline code remains generic.
- The write action uses the existing Action Boundary catalog, revision and action-id idempotency semantics.
- A duplicate action is rejected by the same generic Action Boundary protection.
- Cross-platform proof is evaluated by the existing MASTER-18 semantic conformance authority, not screenshot equality.
- No new retail runtime, policy language, resolver, registry or execution adapter is introduced in Vira core.

## Verification scope

Focused proof coverage validates a retail return flow, platform-consistent governance, protected write execution, duplicate rejection and Web/iOS/Android semantic conformance. Full browser/simulator/emulator execution remains part of the final MASTER-25 local/full CI gate.
