# MASTER-28 — Provider-Neutral Capability Contract

## Goal

Implement the canonical provider-neutral `ViraCapabilityDefinition` without expanding the existing wire-level `protocol.Capability` or creating provider/execution authority.

## Base

- authoritative `main`: `c17d5016a00f915604de73b9797a94e72692c5a6`
- previous phase: MASTER-27 merged via PR #187
- branch: `master/28-capability-contract`
- frozen executable head: `614467b91ba6c7798fe060c4e38fa51a914ddc1d`

## Reverse-engineered ownership

The existing `protocol.Capability` is intentionally a tiny transport/wire identity envelope `{version,id}` and is already consumed by `tool-bridge`. It is not the semantic definition owner and must remain backward compatible.

`capability-contract` OWNS:

- stable capability semantic identity;
- immutable capability release version;
- publisher identity;
- human-readable semantic metadata;
- exact input/output data-contract references;
- exact required WorkContext-type references;
- whether invocation is non-mutating `query` or Action-mediated `action`;
- exact `actionType` binding for Action-mediated capability semantics;
- deterministic canonical serialization.

It DOES NOT OWN:

- provider bindings, endpoints, credentials, SDKs or MCP/SaaS/customer transport details;
- provider selection/routing/availability;
- Action effect or idempotency catalogs;
- governance/policy rules;
- protected Action execution;
- WorkContext payloads;
- data schema language/registry;
- protocol projection/wire transport;
- entitlement, billing or metering;
- application composition.

## Invocation rule

```text
query capability
  → provider-neutral read/compute semantics
  → MUST NOT mutate protected enterprise state

action capability
  → exact semantic actionType
  → governance / Action Boundary remains canonical effect authority
  → provider binding may execute only under the resulting protected execution path
```

`CapabilityDefinition` deliberately does not repeat `ViraActionDefinition.effect` or `idempotency`; those remain owned by `action-boundary`.

## Contract shape

```text
schemaVersion
id
version
publisher
metadata
input.typeRef
output.typeRef
contextRequirements[]
invocation
```

Input/output/context contracts are exact semantic references. MASTER-28 does not invent JSON Schema, provider schemas or WorkContext internals.

## Invariants

- Capability definition version is exact release semver.
- Generic semantic refs use exact `versionRef`; no `latest`, `main`, wildcard/range or silent fallback.
- Publisher id matches the first capability namespace segment.
- Query invocation cannot smuggle `actionType`, effect or idempotency.
- Action invocation requires exact semantic `actionType`.
- Provider/credential/endpoint/transport fields are unknown and fail closed.
- Unsafe non-plain/accessor/cyclic/symbol input fails at shared JSON boundary.
- Context requirements are bounded and duplicate refs rejected.
- Parsed result is detached/deeply frozen.
- Serialization is deterministic.
- New package dependency edge is only `capability-contract → protocol`.

## Verification

Local Q7 was reported GREEN on exact executable head `614467b91ba6c7798fe060c4e38fa51a914ddc1d` for:

```bash
pnpm check:boundaries
pnpm typecheck
pnpm vitest run tests/contract/capability-contract.test.ts
```

Hosted GitHub Actions zero-step failures are not counted as code PASS or code FAIL.

## Q0–Q9

- Q0: PASS — exact base `c17d5016...`.
- Q1: PASS — reverse engineered protocol Capability, tool bridge, Action Boundary and MASTER-26 authority docs.
- Q2: PASS — ownership/invocation invariants frozen above.
- Q3: PASS — types/parser/serializer + boundary entry implemented.
- Q4: PASS — focused positive/negative/security coverage implemented, including inline-schema smuggling and context bounds.
- Q5: PASS — fail-closed/provider-smuggling/effect-bypass review.
- Q6: PASS — architecture review proving wire Capability and Action Boundary owners are not duplicated.
- Q7: PASS — operator-reported exact-head local boundary/type/focused tests on `614467b...`.
- Q8: FINAL COMPARE PENDING — post-Q7 commits must remain documentation/evidence only.
- Q9: BLOCKED until final Q8; then squash merge and start MASTER-29 from new authoritative main.
