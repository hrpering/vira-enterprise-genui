# PROD-08 — Artifact System, Durable ApplicationRun, Triggers and Human Handoff

**Status:** ACTIVE STACKED IMPLEMENTATION  
**Dependency join:** `57830a09d86416b8675a54c0d274dae58f95d07b`  
**Dependencies represented:** PROD-02 + PROD-04 + PROD-05 + PROD-06 + PROD-07  
**Branch:** `prod/08-artifact-durable-run-handoff`

## Authority freeze

- `artifact-contract` owns artifact metadata identity, immutable revision, digest, producer/source lineage, classification and retention semantics.
- Artifact bytes, signed download URLs and provider credentials never enter the canonical artifact metadata contract.
- `integrations/object-store` owns private byte persistence behind tenant/environment-scoped ports; it does not redefine artifact identity.
- `application-runtime` owns ApplicationRun, step, wait and event state semantics.
- `application-resolution` remains the exact release/deployment resolution owner. A run pins its exact resolution and never re-resolves `latest` after waiting.
- `work-context` remains the semantic work-state owner; ApplicationRun references work state rather than cloning its schema.
- Human Task is a work/handoff primitive and is not Transaction Approval authority.
- Trigger delivery uses durable inbox + replay/dedupe semantics; processed event IDs do not grow unbounded inside the ApplicationRun record.
- Revision/CAS ownership remains explicit so duplicate completion or concurrent resume cannot advance a wait twice.

## Required delivery

- `artifact-contract` + private `integrations/object-store`.
- Immutable artifact revision, digest, producer, source, lineage, classification and retention.
- `application-runtime` ApplicationRun/step/wait/event semantics.
- Exact release/resolution pinning with no in-memory canonical stack.
- Human Task assign/claim/release/reassign/complete/expire/escalate.
- API/webhook/schedule/application-call trigger binding.
- Signed webhook verification, bounded payload, durable inbox and replay/dedupe window.
- Operator pause/resume and revision-safe exactly-once continuation.

## Quality gates

- `verify:artifact-lineage`
- `verify:artifact-isolation`
- `verify:application-run-resume`
- `verify:human-handoff`
- `verify:trigger-delivery`
- restart/deploy, duplicate completion, early webhook and 24h virtual-time tests

## First implementation slice

The first slice establishes only the canonical `artifact-contract` owner and its focused lineage gate. Durable run, object-store, Human Task and trigger semantics remain intentionally absent until their owner boundaries are implemented and tested explicitly.

## Explicit non-goals

This phase does not implement protected provider Actions, Transaction Approval, one-time grants, private effect execution, billing, or generalized async Capability jobs. Those remain PROD-09+ owners.
