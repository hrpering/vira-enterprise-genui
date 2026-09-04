# MASTER-44 — Hosted Capability Runtime Foundation

## Goal

Introduce the canonical provider-neutral hosted execution boundary for **query** Capabilities without turning Vira into generic cloud compute, duplicating Capability semantics, or bypassing existing protected-Action authority.

## Base

- authoritative `main`: `e987f3447953761b70c4aa548761bf359b3e07f0`
- previous phase: MASTER-43 merged via PR #204
- branch: `master/44-hosted-capability-runtime`
- draft PR: #205
- current frozen executable head: `c6b21360b6471f506fc7c9ec940f687c96de38af`
- invalidated previous freeze: `52dfb067904b34ffe055431232ed8e621a3b3d6f`

## Q1 reverse engineering

### Capability Contract

`capability-contract` owns canonical `ViraCapabilityDefinition` semantics: exact Capability identity/version, publisher metadata, input/output type references, exact WorkContext requirements and invocation kind (`query` or `action`). It deliberately does not own provider bindings, hosted lifecycle or execution adapters.

Extending `capability-contract` with provider/runtime state would mix semantic meaning with deployment/execution implementation.

### Protocol Gateway / Tool Bridge

`protocol-gateway` owns ingress/protocol normalization and tool/protocol adaptation. MCP is explicitly classified as `tool-data-action-discovery`; normalization does not grant execution authority.

`tool-bridge` owns canonical external-tool result adaptation/freshness/domain helpers. Its `ExternalToolResult` is not a `ViraCapabilityDefinition` execution contract and does not carry enterprise hosted-execution identity.

Hosted Capability execution therefore must not turn either package into a provider runtime.

### Deployment Plane

`deployment-plane` owns signed **Experience Pack** publication, promotion, rollback, cached-pack integrity and environment deployment records. It is not a generic workload scheduler or Capability provider deployment plane.

### Studio Host Runtime / Runtime Core

`studio-host-runtime` bridges Studio UI runtime dispatch to a Studio host. `runtime-core` owns Experience runtime state/lifecycle/permissions. Neither is a server-side Capability execution owner.

### AI-host SDK

`application-ai-host-sdk` validates Application Distribution integrity/host compatibility. It does not expose Capability invocation or provider execution and must remain a thin compatibility SDK.

### Action Boundary

`action-boundary` is the canonical protected-effect execution authority with permit, idempotency, confirmation and receipt semantics.

A Capability whose canonical definition declares `invocation.kind: "action"` must **never** be directly executed by the hosted query runtime. MASTER-44 fails closed before adapter invocation with `ACTION_BOUNDARY_REQUIRED`.

### WorkContext / Enterprise Context

`work-context` already owns bounded Context instances, exact type references, items and provenance. MASTER-44 consumes canonical WorkContext and requires the invocation Context set to match the Capability's exact declared `contextRequirements` with no undeclared extra Context types.

`enterprise-context` remains organization/project/environment/principal authority. MASTER-44 carries canonical principal/scope to the trusted provider adapter but does not authenticate the principal or decide authorization.

## Q2 frozen owner

New package:

```text
@vira-enterprise-genui/hosted-capability-runtime
```

Executable dependencies:

```text
hosted-capability-runtime
  → capability-contract
  → enterprise-context
  → protocol
  → work-context
```

No dependency on:

- `action-boundary` (action Capabilities are rejected, not executed);
- governance/authorization owners;
- commercial entitlement/metering;
- protocol gateway/tool bridge;
- deployment plane;
- runtime-core/Studio runtime;
- provider SDKs, containers, Kubernetes, serverless vendors or cloud APIs.

## Provider binding

A hosted binding is provider-neutral configuration evidence only:

```text
version
bindingRef        exact
capabilityRef     exact
providerId
locationId | null
```

It contains no endpoint URL, credentials, secret values, container image, VM size, billing price or implicit trust claim.

`bindingRef` identifies the exact hosted implementation binding. `providerId` and `locationId` are provenance/routing identifiers only; parsing them does not authenticate the provider, attest isolation or authorize invocation.

## Invocation request

One request carries:

- stable invocation id;
- canonical enterprise principal + scope;
- typed JSON input value;
- bounded canonical WorkContext instances.

The runtime separately receives the canonical `ViraCapabilityDefinition` and hosted binding. It verifies exact Capability identity/version equality rather than resolving latest/fallback aliases.

### Typed values

Execution values use:

```text
{ typeRef: exact-ref | null, value: JsonValue }
```

The request input `typeRef` must exactly match `CapabilityDefinition.input.typeRef`.
The trusted adapter output `typeRef` must exactly match `CapabilityDefinition.output.typeRef`.

MASTER-44 does not invent a second schema/type system. Type references remain opaque exact semantic references; JSON safety and type-reference identity are enforced here while referenced schema semantics remain owned elsewhere.

## Context minimization

Capability `contextRequirements[]` is treated as the exact allowed Context-type set for the hosted request:

- each supplied WorkContext must pass the canonical WorkContext parser;
- duplicate supplied Context type refs fail closed;
- every required type must be present exactly once;
- undeclared extra Context types fail closed;
- no chat history, prompt dump, user memory or arbitrary ambient context is forwarded.

This makes Context disclosure explicit and bounded.

## Query execution lifecycle

MASTER-44 executes only canonical query Capabilities:

1. parse canonical CapabilityDefinition;
2. parse exact hosted binding;
3. require binding Capability exact match;
4. reject `invocation.kind: "action"` with `ACTION_BOUNDARY_REQUIRED` before adapter invocation;
5. validate canonical enterprise principal/scope;
6. validate input value/typeRef;
7. validate exact bounded WorkContext set;
8. invoke the explicitly supplied trusted provider adapter once;
9. fail closed if adapter throws/rejects or returns malformed output;
10. validate output typeRef/JSON against CapabilityDefinition;
11. return immutable execution evidence.

## Result semantics

Result outcomes:

```text
success | empty | error
```

Success evidence may contain the validated typed output. Empty contains no output. Error contains a bounded provider failure code.

The result includes exact Capability/binding/provider/location/invocation identity evidence but contains **no**:

- `authorized`, `allow`, `deny`, `approved`;
- governance verdict;
- Action permit/receipt;
- entitlement decision;
- commercial usage/price/currency/charge;
- deployment approval;
- provider authentication or attestation claim.

A successful query execution is execution evidence only. It cannot override any independent authentication, authorization, enterprise policy, entitlement or governance requirement imposed by the host/integration.

A canonical `query` declaration also does not cryptographically prove that an external provider implementation is side-effect-free. The explicitly supplied adapter is a trusted integration boundary, not a new semantic/security authority.

## Failure invariants

- malformed/untrusted input fails closed through safe JSON/object validation;
- no floating Capability/binding/type references;
- exact binding↔Capability mismatch fails;
- action-kind Capability never reaches provider adapter;
- principal organization must equal enterprise scope organization;
- Context requirements are exact and minimized;
- input/output typeRef mismatch fails;
- adapter exception/rejection becomes explicit failure;
- malformed adapter output fails;
- adapter is called at most once for one invocation attempt;
- no implicit retry, failover, provider priority or fallback;
- no implicit commercial metering record is created from execution success.

## Non-goals

MASTER-44 does not implement:

- provider catalog/discovery;
- durable job queue/scheduler;
- containers/VMs/Kubernetes/serverless orchestration;
- autoscaling/concurrency placement;
- network transport/endpoints;
- secret distribution;
- action execution;
- authorization/governance;
- entitlement enforcement;
- commercial usage ingestion/pricing/payment;
- provider failover/ranking;
- generic workflow/agent runtime.

Those concerns must remain separately owned and only be added by later phases with explicit boundaries.

## Q3 implementation

PASS.

Added `@vira-enterprise-genui/hosted-capability-runtime` with:

- exact provider-neutral binding parser;
- canonical CapabilityDefinition delegation;
- canonical enterprise principal/scope reconstruction;
- exact typed JSON input/output envelopes;
- canonical WorkContext parsing/minimization;
- query-only trusted-adapter invocation;
- explicit `ACTION_BOUNDARY_REQUIRED` refusal for action-kind Capabilities;
- exact `success | empty | error` provider result validation;
- immutable non-authority execution evidence;
- executable package-boundary declaration.

## Q4 focused verification coverage

PASS by contract/static review; final executable validation remains Q7.

Focused suites:

```text
tests/contract/hosted-capability-runtime.test.ts
tests/contract/hosted-capability-runtime-hardening.test.ts
```

Coverage includes:

- exact binding parsing;
- canonical query success/empty/error evidence;
- action adapter non-invocation;
- binding Capability mismatch;
- exact required Context set + deterministic ordering;
- missing/undeclared/duplicate Context rejection;
- input/output typeRef mismatch;
- adapter throw/rejection + no implicit retry;
- floating refs;
- authority/commercial/endpoint/credential smuggling rejection;
- accessor/custom-prototype fail-closed behavior;
- cross-organization principal rejection;
- Context count ceiling;
- invalid provider/location ids;
- malformed provider result/failure code rejection;
- canonical Capability parser delegation.

Static reverse engineering found and corrected one test-fixture issue before the first freeze: `refund.analysis` must use publisher id `refund` because Capability publisher namespace authority requires the first Capability-id segment to equal publisher id.

## Q5 security / fail-closed review

PASS. Evidence: `docs/evidence/MASTER-44/Q5_Q6_REVIEW.md`.

Key results:

- all untrusted binding/request/provider-result payloads use shared safe JSON parsing;
- canonical Capability/WorkContext/enterprise owners are reused rather than bypassed;
- action-kind execution cannot reach adapter;
- undeclared ambient Context cannot be forwarded;
- exact provider result shape blocks authority/commercial/credential smuggling;
- adapter errors/malformed output fail closed;
- provider/binding/location evidence does not claim trust/attestation;
- no implicit retry/failover or metering side effect.

## Q6 architecture / ownership review

PASS. Evidence: `docs/evidence/MASTER-44/Q5_Q6_REVIEW.md`.

Executable dependency authority:

```text
hosted-capability-runtime → capability-contract, enterprise-context, protocol, work-context
```

Nearest existing owners retain their authority; hosted Capability runtime does not absorb Capability semantics, protocol/tool adaptation, Experience deployment/runtime, Action execution, commercial logic or provider/cloud infrastructure.

## Q7 attempt 1

FAIL on exact frozen executable SHA:

```text
52dfb067904b34ffe055431232ed8e621a3b3d6f
```

Operator-reported exact results:

- `pnpm check:boundaries` — PASS;
- `pnpm typecheck` — FAIL with one TS7053 at `packages/hosted-capability-runtime/src/runtime.ts:132`;
- focused suites — PASS, 2/2 files and 22/22 tests.

Evidence: `docs/evidence/MASTER-44/Q7_ATTEMPT_1.md`.

Root cause: shared protocol defines `JsonArray` as `readonly JsonValue[]`; built-in `Array.isArray()` did not sufficiently narrow `JsonArray | JsonObject` for string indexing in `freezeJson()` under the repository typecheck.

Remediation is intentionally local and non-semantic:

```ts
function jsonArray(value: JsonValue): value is JsonArray {
  return Array.isArray(value);
}
```

`freezeJson()` now uses that explicit type guard. The shared protocol JSON contract, hosted request/result semantics, provider lifecycle, authority boundaries and tests are unchanged.

The executable delta from the invalidated freeze to the remediation commit is confined to `packages/hosted-capability-runtime/src/runtime.ts` and is 6 additions / 2 deletions; all other intervening changes are docs/evidence.

## Current Q7 freeze

New frozen executable SHA:

```text
c6b21360b6471f506fc7c9ec940f687c96de38af
```

The entire local gate must be rerun detached at that exact SHA:

```bash
pnpm check:boundaries
pnpm typecheck
pnpm vitest run \
  tests/contract/hosted-capability-runtime.test.ts \
  tests/contract/hosted-capability-runtime-hardening.test.ts
```

No result from the invalidated `52dfb067...` freeze may be reused as final Q7 PASS evidence.

## Q0–Q9

- Q0 PASS — branch reset/verified at exact authoritative main `e987f3447953761b70c4aa548761bf359b3e07f0`.
- Q1 PASS — Capability/protocol/tool/deployment/runtime/AI-host/Action/Context owner reverse engineering.
- Q2 PASS — hosted query-runtime boundary frozen.
- Q3 PASS — package + query runtime + dependency graph implemented.
- Q4 PASS — focused and hardening coverage added; canonical fixture corrected before freeze.
- Q5 PASS — security/fail-closed review.
- Q6 PASS — architecture/ownership review.
- Q7 RERUN PENDING — exact new frozen-head local boundaries/typecheck/focused suites after TS7053 remediation.
- Q8 — independent PR reverse engineering + executable-clean closure compare after Q7.
- Q9 — exact-head squash merge, verify new authoritative main, then start next phase fresh from it.
