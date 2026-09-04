# Active Phase

**Phase:** MASTER-44 — Hosted Capability Runtime Foundation  
**Status:** Q0–Q6 PASS / Q7 PENDING  
**Base SHA:** `e987f3447953761b70c4aa548761bf359b3e07f0`  
**Frozen executable SHA:** `52dfb067904b34ffe055431232ed8e621a3b3d6f`  
**Previous:** MASTER-43 merged via PR #204  
**Branch:** `master/44-hosted-capability-runtime`  
**PR:** #205 (draft)  
**Next:** MASTER-45 after MASTER-44 merge from new authoritative `main`

MASTER-44 introduces the provider-neutral hosted **query Capability** execution boundary without turning Vira into generic cloud compute or duplicating existing semantic/security owners.

Nearest-owner review concluded:

- `capability-contract` owns Capability meaning, input/output type refs, Context requirements and `query | action` invocation semantics;
- `protocol-gateway` / `tool-bridge` own protocol/tool adaptation, not hosted provider execution;
- `deployment-plane` owns signed Experience Pack deployment, not generic workloads;
- `studio-host-runtime` and `runtime-core` own Experience/Studio runtime concerns, not server Capability execution;
- `application-ai-host-sdk` owns Distribution integrity + compatibility ergonomics only;
- `action-boundary` remains the protected-effect authority.

New canonical owner:

```text
@vira-enterprise-genui/hosted-capability-runtime
```

Executable dependency boundary:

```text
hosted-capability-runtime → capability-contract, enterprise-context, protocol, work-context
```

Foundation invariants:

- only canonical `query` Capabilities may reach the trusted provider adapter;
- `action` Capabilities fail with `ACTION_BOUNDARY_REQUIRED` before adapter invocation;
- exact binding ↔ Capability identity/version only;
- canonical enterprise principal/scope is carried, but the runtime does not authenticate or authorize it;
- request Context must exactly match declared Capability `contextRequirements`, with no ambient/extra Context leakage;
- input/output type refs must exactly match the canonical CapabilityDefinition contracts;
- adapter result is bounded execution evidence only and never means authorization, governance approval, entitlement, deployment approval or provider attestation;
- `providerId`, binding and location evidence do not attest that an external query implementation is side-effect-free;
- no implicit retry/failover/ranking;
- no automatic commercial usage record from execution success;
- no endpoints, credentials, containers, Kubernetes/serverless/cloud scheduling or generic workload orchestration.

Q3 implementation PASS and Q4 focused/hardening coverage added. Q5 security/fail-closed review PASS and Q6 architecture/ownership review PASS; evidence is recorded in `docs/evidence/MASTER-44/Q5_Q6_REVIEW.md`.

Frozen executable SHA is `52dfb067904b34ffe055431232ed8e621a3b3d6f`. Changes after that SHA are documentation/evidence only. Q7 exact frozen-head local boundaries/typecheck/focused test execution is pending on draft PR #205.
