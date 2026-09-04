# MASTER-44 Q5/Q6 Security + Architecture Review

**Date:** 2026-09-05  
**Base SHA:** `e987f3447953761b70c4aa548761bf359b3e07f0`  
**Frozen executable candidate:** `52dfb067904b34ffe055431232ed8e621a3b3d6f`

## Q5 security / fail-closed review

**PASS.**

- CapabilityDefinition is parsed only by canonical `capability-contract`; hosted runtime does not duplicate Capability release validation.
- Binding/request/provider-result inputs pass through shared safe JSON parsing; accessors, custom prototypes, symbols/non-JSON values and malformed shapes fail closed.
- Hosted binding and typed values reject floating aliases/ranges and require exact semantic references.
- Binding Capability id/version must equal canonical CapabilityDefinition id/version exactly.
- `invocation.kind: "action"` fails with `ACTION_BOUNDARY_REQUIRED` before the trusted provider adapter is invoked.
- Canonical enterprise principal/scope is reconstructed through `enterprise-context`; cross-organization principals fail closed.
- WorkContext instances are reparsed through canonical `work-context`, exact context type refs are deduplicated, required contexts must be present and undeclared extra context types are rejected.
- Input and provider output type refs must exactly match the canonical CapabilityDefinition contracts.
- Adapter output has an exact `success | empty | error` shape. Authority, commercial, credential and endpoint fields cannot be smuggled through provider result evidence.
- Adapter throw/rejection produces explicit `ADAPTER_FAILED`; malformed adapter output fails closed.
- One invoke call performs at most one adapter call. There is no implicit retry/failover/provider fallback.
- Execution success does not emit commercial usage automatically and carries no authorization/governance/entitlement/price/payment fields.

### Trust boundary note

A Capability declaring `query` is canonical semantic intent, not cryptographic proof that an external provider implementation is side-effect-free. `providerId`, `bindingRef` and `locationId` are provenance/routing evidence only. The explicitly supplied adapter is a trusted integration boundary; hosted execution success is not provider authentication, attestation, authorization or policy approval.

## Q6 architecture / ownership review

**PASS.**

Nearest-owner review shows no existing package owns provider-neutral hosted Capability execution lifecycle:

- `capability-contract` owns Capability meaning only;
- `protocol-gateway` / `tool-bridge` own protocol/tool adaptation;
- `deployment-plane` owns signed Experience Pack deployment;
- `runtime-core` / `studio-host-runtime` own Experience/Studio runtime surfaces;
- `application-ai-host-sdk` owns Application Distribution integrity/compatibility ergonomics;
- `action-boundary` remains protected Action execution authority;
- `work-context` and `enterprise-context` remain canonical Context/scope owners.

New owner:

```text
hosted-capability-runtime
```

Executable dependency graph:

```text
hosted-capability-runtime
  → capability-contract
  → enterprise-context
  → protocol
  → work-context
```

No executable dependency is introduced to Action Boundary because action Capabilities are refused rather than executed. No dependency is introduced to governance, commercial layers, protocol gateways, deployment, Studio/runtime packages, provider SDKs or cloud infrastructure.

The package remains a bounded provider-neutral query execution boundary, not a generic scheduler/cloud-compute platform. Provider catalog, transport, credentials, isolation attestations, durable jobs, autoscaling, failover, action execution and commercial ingestion remain separately owned future concerns.

## Static implementation checks

- Capability and WorkContext canonical parsers deep-freeze returned structures before hosted adapter exposure.
- Enterprise principal/scope values are canonical frozen outputs from `enterprise-context`.
- Hosted typed JSON input/output is detached through safe parsing and recursively frozen.
- Exact-reference floating syntax is parity-aligned with the canonical Capability reference validator.
- Test fixtures were corrected during review to honor Capability publisher namespace authority (`refund.analysis` → publisher id `refund`).

## Verdict

Q5 PASS. Q6 PASS. No executable blocker found in static review. Exact frozen-head local verification remains mandatory before Q7 can pass.
