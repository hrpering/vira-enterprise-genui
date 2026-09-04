# Active Phase

**Phase:** MASTER-44 — Hosted Capability Runtime Foundation  
**Status:** Q0–Q8 PASS / Q9 READY  
**Base SHA:** `e987f3447953761b70c4aa548761bf359b3e07f0`  
**Frozen executable SHA:** `c6b21360b6471f506fc7c9ec940f687c96de38af`  
**Previous frozen SHA:** `52dfb067904b34ffe055431232ed8e621a3b3d6f` — invalidated by Q7 typecheck defect  
**Previous:** MASTER-43 merged via PR #204  
**Branch:** `master/44-hosted-capability-runtime`  
**PR:** #205 (draft until final closure compare)  
**Next:** MASTER-45 after MASTER-44 merge from new authoritative `main`

MASTER-44 introduces the provider-neutral hosted **query Capability** execution boundary without turning Vira into generic cloud compute or duplicating existing semantic/security owners.

Canonical owner boundary:

```text
hosted-capability-runtime → capability-contract, enterprise-context, protocol, work-context
```

Foundation invariants:

- only canonical `query` Capabilities may reach the trusted provider adapter;
- `action` Capabilities fail with `ACTION_BOUNDARY_REQUIRED` before adapter invocation;
- exact binding ↔ Capability identity/version only;
- canonical enterprise principal/scope is carried, but the runtime does not authenticate or authorize it;
- request Context exactly matches declared Capability `contextRequirements`, with no ambient/extra Context leakage;
- input/output type refs exactly match canonical CapabilityDefinition contracts;
- the execution evidence envelope never becomes authorization, governance, entitlement, deployment or commercial authority;
- typed `output.value` remains domain data under its exact type reference and does not acquire authority from field names;
- provider/binding/location evidence is not authentication or attestation;
- no implicit retry/failover/ranking;
- no automatic commercial usage record from execution success;
- no endpoints, credentials, containers, Kubernetes/serverless/cloud scheduling or generic workload orchestration.

Q5/Q6 security and architecture review PASS. Q7 attempt 1 correctly failed and invalidated the old freeze because of TS7053 in `freezeJson()`; evidence is retained in `docs/evidence/MASTER-44/Q7_ATTEMPT_1.md`.

The local explicit `JsonArray` type-guard remediation produced the final frozen executable SHA `c6b21360b6471f506fc7c9ec940f687c96de38af`. The operator reran the full local Q7 command set at that exact SHA and reported it green; final evidence is `docs/evidence/MASTER-44/Q7_LOCAL_PASS.md`.

Q8 independent PR reverse engineering PASS at reviewed head `99e80da0f41f06ccd52dc497e2ba7dd92d9ed7b1`; evidence is `docs/evidence/MASTER-44/Q8_REVIEW.md`. Frozen executable → reviewed head contained documentation/evidence only.

Hosted `verify`, `android-native` and `ios-native` failures remain infrastructure non-signal because their jobs expose no executed steps.

MASTER-44 is Q9 READY subject to one final frozen-executable → closure-head compare proving executable drift remains zero. Any executable change invalidates Q7/Q8 and blocks merge.
