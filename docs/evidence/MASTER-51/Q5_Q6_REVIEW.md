# MASTER-51 — Q5/Q6 Security + Architecture Review

**Date:** 2026-09-05  
**Phase:** MASTER-51 — Cross-Surface Exact Semantics + Application Network RC  
**Authoritative base SHA:** `6f02e4437210c0cd662f1852759c88fca328462c`  
**Current frozen executable/test/config SHA:** `e8f568834752ce92796c9cddec5745b373b07d69`  
**Invalidated previous freeze:** `a3ba23a68f68aee894f818823ba1003511024f19`

## Result

- **Q5 security / fail-closed review:** PASS (static, repeated after Q7 attempt-3 test-harness remediation)
- **Q6 architecture / ownership review:** PASS (static, repeated after Q7 attempt-3 test-harness remediation)
- **Q7:** full rerun required on current freeze
- **Q8:** blocked until that rerun passes

Earlier Q7 results on `952e3445...` and `a3ba23a...` are historical only. The current merge-authorizing executable/test/config candidate is `e8f568834752ce92796c9cddec5745b373b07d69`.

## Remediations reviewed

### Q8 owner-drift remediation

Independent Q8 found duplicate Capability release identity validation between `capability-contract` and `capability-supply`.

The canonical remediation remains narrow:

- `capability-contract` exports `parseViraCapabilityReleaseReference()` and `serializeViraCapabilityReleaseReference()`;
- `parseViraCapabilityDefinition()` delegates root `id/version` release identity to that API;
- `lookupViraCapabilitySupply()` delegates `capabilityId/capabilityVersion` query identity to the same owner and only maps issue paths into `$query.*`;
- the local Capability-supply `RELEASE_VERSION` parser is removed;
- direct parser ↔ CapabilityDefinition ↔ CapabilitySupply query parity is covered by `capability-release-reference-owner.test.ts` and included in the Network cross-surface gate.

No new domain package or semantic owner was introduced. `capability-contract` remains the existing canonical Capability owner.

### Q7 attempt-3 test-harness remediation

Attempt 3 exposed only module resolution in the new internal contract test. The test incorrectly used bare workspace package imports from `tests/contract`, while the established contract-test pattern uses relative package source entrypoints.

The remediation changes only those two imports to:

- `../../packages/capability-contract/src/index.js`;
- `../../packages/capability-supply/src/index.js`.

The external `@acme` proof workspace continues to use public bare package-root imports. No production source or semantic behavior changed in this remediation.

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

Application Capability `id@version` is read from the discovered/verified canonical Application and used directly as the Capability supply query identity. Supply validates that release identity through `capability-contract` rather than a second semver implementation.

### No floating / implicit resolution

PASS.

- Application exact references reject floating aliases/wildcards before publisher digest generation;
- Application federation lookup uses canonical exact Application release identity;
- AI-host protocol projection compatibility remains exact id + exact versionRef;
- Capability release identity is canonicalized by `capability-contract` for CapabilityDefinition and supply lookup;
- exact supply misses return empty success;
- no latest, fallback, substitute release/provider, ranking, priority or near-match behavior is introduced.

### Distribution integrity / host boundary

PASS.

Distribution integrity remains explicit before AI-host compatibility succeeds. Integrity declaration is not authentication, authorization, entitlement, deployment or execution permission.

### Capability execution boundary

PASS.

- Capability supply remains discovery/composition only and never invokes providers;
- supply accepts query Capabilities only;
- hosted binding `capabilityRef` must exactly match CapabilityDefinition id/version;
- divergent binding identity fails before adapter invocation;
- action-kind Capabilities remain behind Action Boundary;
- hosted provider adapter invocation remains one-shot;
- no retry/failover/substitute-provider behavior is added.

### Canonical release parser hardening

PASS.

The Capability release owner consumes untrusted input through shared safe JSON parsing, requires exact `{ id, version }`, namespaced Capability identity and exact release semver, returns frozen canonical output, and fails closed on accessor-backed input without invoking getters.

### Lint remediation safety

PASS.

Earlier baseline lint remediation remains narrow and unchanged:

- `no-control-regex` disabled only for explicit intentional validation files;
- `no-useless-escape` disabled only for the existing design-import validator file;
- unused-variable enforcement retained with only the exact inherited legacy symbol ignored in commercial entitlement.

### Authority-smuggling review

PASS.

Network source IDs and Capability source/provider/binding/location IDs remain provenance/routing only. Discovery/compatibility/execution cannot manufacture authentication, attestation, authorization, entitlement, trust, deployment permission, endpoint ownership or credential authority.

### RC orchestration fail-closed behavior

PASS.

`verify:application-network-rc` remains a synchronous fail-fast composition gate over Enterprise RC, independent publisher/AI-host/provider proofs and the cross-surface Network proof. It owns no semantic truth and stops on any child non-zero exit.

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

The owner remediation reduces duplication; the attempt-3 import fix changes no owner.

### Internal contract test vs external proof boundary

PASS.

`tests/contract/capability-release-reference-owner.test.ts` now follows the repository's established internal contract-test convention and imports relative source entrypoints. This does not weaken the independent external proof invariant: `@acme/vira-application-network-rc-proof` still consumes public Vira package roots only.

### Dependency graph

PASS.

No new package dependency edge is required. `capability-supply` already depends on `capability-contract`; the test import correction creates no runtime dependency.

### Scope prohibitions

No current MASTER-51 executable code introduces provider authentication/attestation, endpoint/credential catalogs, provider health/SLA/ranking/failover, commercial entitlement/pricing/settlement authority, deployment placement/autoscaling, generic cloud compute, new Action execution semantics, new protocol semantics, or a second Application/Capability release parser.

## Current freeze

Current executable/test/config freeze:

`e8f568834752ce92796c9cddec5745b373b07d69`

Q7 attempt 3 on `a3ba23a68f68aee894f818823ba1003511024f19` failed at typecheck because of the new contract test's two bare package-root imports. That freeze is invalid for final merge authority.

A full local Q7 rerun on the exact current freeze is required before Q8 may restart.
