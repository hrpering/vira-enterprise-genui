# MASTER-44 — Hosted Capability Runtime Foundation

## Goal

Introduce the canonical provider-neutral hosted execution boundary for **query** Capabilities without turning Vira into generic cloud compute, duplicating Capability semantics, or bypassing existing protected-Action authority.

## Base

- authoritative `main`: `e987f3447953761b70c4aa548761bf359b3e07f0`
- previous phase: MASTER-43 merged via PR #204
- branch: `master/44-hosted-capability-runtime`
- draft PR: #205
- final frozen executable head: `c6b21360b6471f506fc7c9ec940f687c96de38af`
- invalidated previous freeze: `52dfb067904b34ffe055431232ed8e621a3b3d6f`

## Q1 reverse engineering

### Capability Contract

`capability-contract` owns canonical `ViraCapabilityDefinition` semantics: exact Capability identity/version, publisher metadata, input/output type references, exact WorkContext requirements and invocation kind (`query` or `action`). It deliberately does not own provider bindings, hosted lifecycle or execution adapters.

Extending `capability-contract` with provider/runtime state would mix semantic meaning with deployment/execution implementation.

### Protocol Gateway / Tool Bridge

`protocol-gateway` owns ingress/protocol normalization and tool/protocol adaptation. MCP is explicitly classified as `tool-data-action-discovery`; normalization does not grant execution authority.

`tool-bridge` owns canonical external-tool result adaptation/freshness/domain helpers. Its `ExternalToolResult` is not a `ViraCapabilityDefinition` execution contract and does not carry enterprise hosted-execution identity.

### Deployment / Studio / AI-host owners

`deployment-plane` owns signed **Experience Pack** publication/promotion/rollback, not generic Capability workloads. `studio-host-runtime` bridges Studio UI runtime to a Studio host. `runtime-core` owns Experience runtime state/lifecycle/permissions. `application-ai-host-sdk` owns Distribution integrity + host compatibility ergonomics only. None is a server-side Capability execution owner.

### Action Boundary

`action-boundary` remains the canonical protected-effect execution authority with permit, idempotency, confirmation and receipt semantics.

A Capability whose canonical definition declares `invocation.kind: "action"` must never be directly executed by the hosted query runtime. MASTER-44 fails closed before adapter invocation with `ACTION_BOUNDARY_REQUIRED`.

### WorkContext / Enterprise Context

`work-context` owns bounded Context instances, exact type references, items and provenance. MASTER-44 consumes canonical WorkContext and requires the invocation Context set to match the Capability's exact declared `contextRequirements` with no undeclared extra Context types.

`enterprise-context` remains organization/project/environment/principal authority. MASTER-44 carries canonical principal/scope to the trusted provider adapter but does not authenticate the principal or decide authorization.

## Q2 canonical owner

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

No dependency on Action Boundary, governance/authorization owners, commercial entitlement/metering, protocol gateway/tool bridge, deployment plane, runtime-core/Studio runtime, provider SDKs, containers, Kubernetes, serverless vendors or cloud APIs.

## Provider binding

A hosted binding is provider-neutral configuration/execution evidence only:

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

Execution values use:

```text
{ typeRef: exact-ref | null, value: JsonValue }
```

The request input `typeRef` must exactly match `CapabilityDefinition.input.typeRef`. The trusted adapter output `typeRef` must exactly match `CapabilityDefinition.output.typeRef`.

MASTER-44 does not invent a second schema/type system. Type references remain opaque exact semantic references; JSON safety and type-reference identity are enforced here while referenced schema semantics remain owned elsewhere.

## Context minimization

Capability `contextRequirements[]` is treated as the exact allowed Context-type set for the hosted request:

- each supplied WorkContext passes the canonical WorkContext parser;
- duplicate supplied Context type refs fail closed;
- every required type is present exactly once;
- undeclared extra Context types fail closed;
- no chat history, prompt dump, user memory or arbitrary ambient context is forwarded by core.

Accepted Contexts are deterministically ordered before provider invocation.

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

The **execution evidence envelope** contains no authorization/governance/entitlement/deployment/commercial authority fields such as `authorized`, `allow`, `deny`, Action permit/receipt, entitlement decision, price/currency/charge, deployment approval or provider attestation claim.

A typed domain payload inside `output.value` remains ordinary domain data governed by its exact type reference. Arbitrary JSON field names inside that payload do not acquire Vira authority merely because they are named `authorized`, `price`, or similar.

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

MASTER-44 does not implement provider catalog/discovery, durable job queues, containers/VMs/Kubernetes/serverless orchestration, autoscaling/concurrency placement, network transports/endpoints, secret distribution, action execution, authorization/governance, entitlement enforcement, commercial usage ingestion/pricing/payment, provider failover/ranking or a generic workflow/agent runtime.

## Q3 implementation

PASS.

Added `@vira-enterprise-genui/hosted-capability-runtime` with exact provider-neutral binding parsing, canonical CapabilityDefinition delegation, canonical enterprise principal/scope reconstruction, exact typed JSON input/output envelopes, canonical WorkContext parsing/minimization, query-only trusted-adapter invocation, explicit action refusal, exact provider result validation, immutable non-authority execution evidence and an executable package-boundary declaration.

## Q4 focused coverage

PASS.

Focused suites:

```text
tests/contract/hosted-capability-runtime.test.ts
tests/contract/hosted-capability-runtime-hardening.test.ts
```

Coverage includes exact binding parsing; query success/empty/error evidence; action adapter non-invocation; binding Capability mismatch; required/missing/undeclared/duplicate Context behavior; deterministic Context ordering; input/output typeRef mismatch; adapter throw/rejection and no retry; floating refs; authority/commercial/endpoint/credential envelope smuggling rejection; accessor/custom-prototype fail-closed behavior; cross-organization principal rejection; Context count ceiling; malformed provider results/failure codes; and canonical Capability parser delegation.

Static review corrected the fixture publisher namespace before the first freeze: `refund.analysis` uses publisher id `refund`, matching canonical Capability owner rules.

## Q5 security review

PASS. Evidence: `docs/evidence/MASTER-44/Q5_Q6_REVIEW.md`.

Key results:

- all untrusted binding/request/provider-result payloads use shared safe JSON parsing;
- canonical Capability/WorkContext/enterprise owners are reused rather than bypassed;
- action-kind execution cannot reach adapter;
- undeclared ambient Context cannot be forwarded;
- exact provider result envelope blocks authority/commercial/credential smuggling;
- adapter errors/malformed output fail closed;
- provider/binding/location evidence does not claim trust/attestation;
- no implicit retry/failover or metering side effect.

## Q6 architecture review

PASS. Evidence: `docs/evidence/MASTER-44/Q5_Q6_REVIEW.md`.

Executable dependency authority remains exactly:

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

- package boundaries PASS;
- typecheck FAIL with TS7053 in `freezeJson()`;
- focused suites PASS, 2/2 files and 22/22 tests.

Evidence: `docs/evidence/MASTER-44/Q7_ATTEMPT_1.md`.

Root cause: shared protocol defines `JsonArray` as `readonly JsonValue[]`; built-in `Array.isArray()` did not sufficiently narrow `JsonArray | JsonObject` for string indexing under repository typecheck.

Remediation was intentionally local and non-semantic: an explicit `JsonArray` type guard was added. The executable delta was confined to `packages/hosted-capability-runtime/src/runtime.ts` and shared JSON semantics were unchanged.

## Q7 final local gate

PASS on exact frozen executable SHA:

```text
c6b21360b6471f506fc7c9ec940f687c96de38af
```

Commands:

```bash
pnpm check:boundaries
pnpm typecheck
pnpm vitest run \
  tests/contract/hosted-capability-runtime.test.ts \
  tests/contract/hosted-capability-runtime-hardening.test.ts
```

The operator reran the full gate at the exact SHA and reported it green. Evidence: `docs/evidence/MASTER-44/Q7_LOCAL_PASS.md`. Counts/timings are not reconstructed from the invalidated first attempt.

Any executable change after this SHA invalidates Q7.

## Q8 independent PR reverse engineering

PASS. Evidence: `docs/evidence/MASTER-44/Q8_REVIEW.md`.

Reviewed PR head:

```text
99e80da0f41f06ccd52dc497e2ba7dd92d9ed7b1
```

Independent review re-read PR metadata, changed-file list, runtime/types/package/boundary patches and both focused suites. No owner duplication, authority leak, implicit latest/fallback, Action Boundary bypass, ambient Context leak, retry/failover behavior or commercial/governance authority creep was found.

Frozen executable `c6b21360...` → reviewed head contained documentation/evidence changes only. Hosted `verify`, `android-native` and `ios-native` jobs remain infrastructure non-signal because they expose no executed steps.

## Q0–Q9

- Q0 PASS — branch started from exact authoritative main `e987f3447953761b70c4aa548761bf359b3e07f0`.
- Q1 PASS — nearest-owner reverse engineering.
- Q2 PASS — hosted query-runtime boundary frozen.
- Q3 PASS — package + runtime + dependency graph implemented.
- Q4 PASS — focused/hardening coverage added.
- Q5 PASS — security/fail-closed review.
- Q6 PASS — architecture/ownership review.
- Q7 PASS — exact final frozen-head local gate on `c6b21360b6471f506fc7c9ec940f687c96de38af`.
- Q8 PASS — independent PR reverse engineering and executable-clean reviewed-head compare.
- Q9 READY — requires final frozen-executable → closure-head compare, ready transition, exact-head squash merge and verification of new authoritative main.
