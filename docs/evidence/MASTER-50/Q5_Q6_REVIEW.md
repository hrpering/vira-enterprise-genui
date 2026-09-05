# MASTER-50 — Q5/Q6 Security + Architecture Review

**Date:** 2026-09-05  
**Base SHA:** `46f4d8ec163790765d162d13747dd4f64bf0e8ea`  
**Frozen executable/test SHA:** `5ed6832fa9f233b0b7eb44a8fc5f10f143d00905`  
**Branch:** `master/50-external-provider-proof`

## Result

- **Q5 security/fail-closed review:** PASS (static)
- **Q6 architecture/ownership review:** PASS (static)
- **Q7 local execution:** PENDING on the exact frozen SHA above

No runtime test counts, warning counts or timings are asserted by this static review.

## Q5 — security / fail-closed findings

### Canonical exact-reference boundary

- `capability-contract` now exposes owner-local `parseViraCapabilityExactReference()` and `serializeViraCapabilityExactReference()`.
- Exact references are safe-JSON parsed, exact-shape `{ id, versionRef }` only, semantic-namespace validated and deeply detached/frozen at the reference boundary.
- Floating aliases/ranges such as `latest`, `current`, `stable`, `head`, `main`, `next` and `x` forms fail closed.
- Unknown fields fail closed; deterministic key ordering prevents input insertion order from changing the reported field.
- Unsafe accessors and custom-prototype reference inputs fail before getter execution through the shared JSON boundary.
- CapabilityDefinition nested input/output/context references and hosted binding/request value references delegate to this same owner API; consumers remap only the owner issue path into their local nesting path.

### Provider supply / discovery

- `capability-supply` remains parsing and exact discovery only; it does not invoke a provider adapter.
- Supply accepts canonical hosted `query` Capabilities only; `action` Capabilities fail with `ACTION_BOUNDARY_REQUIRED`.
- Binding `capabilityRef` must exactly match canonical Capability `id@version`.
- Exact lookup uses capability id + release version and optional exact provider/location filters.
- Exact miss returns successful empty results; there is no latest, substitute provider, ranking, priority, retry or fallback.
- Cross-source semantic/binding conflicts remain fail-closed.
- `sourceId`, `providerId`, `bindingRef` and `locationId` remain provenance/routing evidence only.

### Hosted provider invocation

- `hosted-capability-runtime` parses canonical CapabilityDefinition and canonical exact-reference semantics before adapter invocation.
- Capability/binding identity mismatch fails before adapter invocation.
- `action` Capability execution fails before adapter invocation and remains behind the Action Boundary.
- Principal/scope, typed input and declared WorkContexts are validated/minimized before the adapter receives data.
- The adapter is invoked at most once by core. Throw/rejection maps to `ADAPTER_FAILED`; malformed output fails closed; there is no automatic retry/failover.
- Success output typeRef must exactly match CapabilityDefinition output typeRef.
- Provider result shape is exact; authority/commercial/credential fields cannot be smuggled into execution evidence.
- Execution evidence contains routing/provenance plus bounded outcome data; it does not acquire authentication, attestation, authorization, entitlement, pricing, deployment or governance authority.

### External proof consumer

`@acme/vira-external-provider-proof` imports only public Vira package roots:

- `@vira-enterprise-genui/capability-contract`
- `@vira-enterprise-genui/capability-supply`
- `@vira-enterprise-genui/hosted-capability-runtime`

The proof covers canonical exact-reference use, supply parsing, exact provider/location discovery, one-shot public hosted invocation, Action Boundary rejection, no-fallback misses, routing/trust separation, authority-smuggling rejection, binding mismatch and provider-throw fail-closed behavior.

## Q6 — architecture / ownership findings

### Existing owners remain authoritative

- `capability-contract` remains the canonical CapabilityDefinition and Capability exact-reference semantic owner.
- MASTER-50 does not create a new provider/capability/reference owner; it exposes the owner-local exact-reference parse/serialize surface that downstream packages were previously duplicating.
- CapabilityDefinition validation itself consumes the new owner-local exact-reference API, preventing the public parser and nested-definition parser from drifting.
- `hosted-capability-runtime` remains the hosted query execution boundary and consumes canonical reference semantics rather than defining a second versionRef parser.
- `capability-supply` remains provider-neutral supply snapshot + exact discovery/conflict owner and is not converted into execution authority.

### Authority remains separated

MASTER-50 does not add or own:

- provider authentication or attestation;
- endpoint/transport/credential semantics;
- health/SLA or provider ranking;
- retries/failover/autoscaling;
- VM/container/Kubernetes/serverless scheduling;
- generic cloud compute;
- authorization/governance;
- commercial entitlement/pricing/metering/settlement;
- protected Action execution.

A successful external provider adapter call is interoperability/execution evidence only. It does not prove the provider is authenticated, trusted, isolated, entitled or authorized.

### Dependency / scope hygiene

The frozen diff adds no new core package dependency edge or boundary exemption. The independent `@acme` proof composes existing public package roots. Base-to-freeze changed files are limited to:

- external provider proof package/test;
- root focused proof script;
- `capability-contract` exact-reference owner API + owner delegation;
- `hosted-capability-runtime` owner delegation;
- focused owner-parity test.

No commercial, Application federation, deployment/cloud or Action Boundary implementation package is pulled into the proof.

## Freeze decision

The final executable/test state reviewed for Q5/Q6 is frozen at:

`5ed6832fa9f233b0b7eb44a8fc5f10f143d00905`

Any executable/package/test/boundary change after this SHA invalidates this freeze and requires a new Q7 local run. Documentation/evidence-only closure changes do not invalidate the executable freeze.
