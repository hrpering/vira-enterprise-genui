# MASTER-51 — Q5/Q6 Security + Architecture Review

**Date:** 2026-09-05  
**Phase:** MASTER-51 — Cross-Surface Exact Semantics + Application Network RC  
**Authoritative base SHA:** `6f02e4437210c0cd662f1852759c88fca328462c`  
**Current frozen executable/test/config SHA:** `a3ba23a68f68aee894f818823ba1003511024f19`  
**Invalidated previous freeze:** `952e3445d46d0b3770a499522abc1ad77315a228`

## Result

- **Q5 security / fail-closed review:** PASS (static, repeated after Q8 owner-drift remediation)
- **Q6 architecture / ownership review:** PASS (static, repeated after Q8 owner-drift remediation)
- **Q7:** rerun required on current freeze
- **Q8:** blocked until that rerun passes

The operator-reported final Q7 PASS on previous freeze `952e3445...` is historical evidence only because Q8 required executable changes.

## Remediation reviewed

Independent Q8 found duplicate Capability release identity validation between `capability-contract` and `capability-supply`.

The remediation is deliberately narrow:

- `capability-contract` exports canonical `parseViraCapabilityReleaseReference()` and `serializeViraCapabilityReleaseReference()`;
- `parseViraCapabilityDefinition()` delegates root `id/version` release identity to that API;
- `lookupViraCapabilitySupply()` delegates `capabilityId/capabilityVersion` query identity to that same owner and only maps owner issue paths into `$query.*` paths;
- the local Capability-supply `RELEASE_VERSION` parser is removed;
- a direct parser ↔ CapabilityDefinition ↔ CapabilitySupply query parity test is added and included in the Network cross-surface gate.

No new domain package or semantic owner was introduced. `capability-contract` was already the canonical Capability owner; this change completes that owner's public release-identity surface.

## Q5 — security / fail-closed review

### Cross-surface exact identity

PASS.

Canonical proof remains:

```text
external publisher
  ↓
application-publisher-sdk
  ↓ canonical Distribution
application-federation exact lookup
  ↓
application-ai-host-sdk + explicit integrity verifier
  ↓ exact Application Capability reference
capability-supply exact lookup
  ↓
hosted-capability-runtime one-shot query adapter
```

Application Capability `id@version` is read from the discovered/verified canonical Application and used directly as the Capability supply query identity. Supply now validates that release identity through `capability-contract` rather than through a second semver implementation.

### No floating / implicit resolution

PASS.

- Application exact references reject floating aliases/wildcards before publisher digest generation;
- Application federation lookup uses exact Application release identity through the Application owner API;
- AI-host protocol projection compatibility remains exact id + exact versionRef;
- Capability release identity is now canonicalized by `capability-contract` for both CapabilityDefinition and supply lookup;
- exact supply misses return empty success;
- no latest, fallback, substitute release/provider, ranking, priority or near-match behavior is introduced.

### Distribution integrity / host boundary

PASS.

Distribution integrity remains explicit before AI-host compatibility succeeds. Integrity declaration is not treated as authentication, authorization, entitlement, deployment or execution permission.

### Capability execution boundary

PASS.

- Capability supply remains discovery/composition only and does not invoke providers;
- supply accepts query Capabilities only;
- hosted binding `capabilityRef` must exactly match CapabilityDefinition id/version;
- divergent binding identity fails before adapter invocation;
- action-kind Capabilities remain behind Action Boundary;
- hosted provider adapter invocation remains one-shot;
- no retry/failover/substitute-provider behavior is added.

### Canonical release parser hardening

PASS.

The new Capability release owner:

- consumes untrusted input through shared safe JSON parsing;
- requires an exact two-field `{ id, version }` shape;
- requires a namespaced semantic Capability id;
- requires exact release semver;
- returns frozen canonical output;
- fails closed on accessor-backed input without invoking getters, covered by the new parity test.

### Lint remediation safety

PASS.

The earlier Q7 lint remediation remains unchanged in the new freeze:

- `no-control-regex` is disabled only for explicit validation files using intentional control-character rejection regexes;
- `no-useless-escape` is disabled only for the existing design-import validator file;
- unused-variable enforcement remains enabled with only the exact inherited legacy symbol ignored in commercial entitlement.

No broad lint bypass was introduced by the Q8 remediation.

### Authority-smuggling review

PASS.

Network source IDs and Capability source/provider/binding/location IDs remain provenance/routing only. Successful discovery/compatibility/execution does not manufacture authentication, attestation, authorization, entitlement, trust, deployment permission, endpoint ownership or credential authority.

### RC orchestration fail-closed behavior

PASS.

`verify:application-network-rc` remains a synchronous fail-fast composition gate:

1. Enterprise RC baseline;
2. independent external publisher proof;
3. independent external AI-host proof;
4. independent external provider proof;
5. cross-surface Network proof, now also including Capability release-owner parity.

The orchestrator owns no semantic truth and stops on any child non-zero exit.

## Q6 — architecture / ownership review

### Canonical owner chain

PASS.

- `application-package` — Application exact/release identity and package semantics;
- `application-distribution` — Distribution/integrity envelope semantics;
- `application-publisher-sdk` — publisher preparation ergonomics;
- `application-federation` — public exact Application discovery/conflicts;
- `application-ai-host-sdk` — integrity-gated compatibility ergonomics;
- `capability-contract` — CapabilityDefinition, exact references and Capability release identity;
- `capability-supply` — exact provider-neutral supply discovery/conflicts only;
- `hosted-capability-runtime` — one-shot hosted query execution boundary;
- `action-boundary` — protected effects.

The Q8 remediation reduces duplication; it does not create a second owner.

### Public-root composition

PASS.

The `@acme/vira-application-network-rc-proof` workspace imports only public Vira package roots. The new Capability release owner is also exported from the public `capability-contract` package root.

### Dependency graph

PASS.

No new package dependency edge is required: `capability-supply` already depends on `capability-contract`. No commercial, federation, governance, deployment or cloud dependency was added to the Capability release owner path.

### Scope prohibitions

No current MASTER-51 executable code introduces:

- provider authentication/attestation;
- endpoint/credential catalogs;
- provider health/SLA/ranking/failover;
- commercial entitlement/pricing/settlement authority;
- deployment placement/autoscaling;
- generic VM/container/Kubernetes/serverless/cloud compute;
- new Action execution semantics;
- new protocol semantics;
- a second Application or Capability release parser.

## Current freeze

Current executable/test/config freeze:

`a3ba23a68f68aee894f818823ba1003511024f19`

The previous operator-reported Q7 final PASS on `952e3445d46d0b3770a499522abc1ad77315a228` is invalid for final merge authority because executable/test content changed after Q8 attempt 1.

A full local Q7 rerun on the exact current freeze is required before Q8 may restart.
