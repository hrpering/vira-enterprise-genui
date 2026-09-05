# MASTER-51 — Q5/Q6 Security + Architecture Review

**Date:** 2026-09-05  
**Phase:** MASTER-51 — Cross-Surface Exact Semantics + Application Network RC  
**Authoritative base SHA:** `6f02e4437210c0cd662f1852759c88fca328462c`  
**Frozen executable/config SHA:** `952e3445d46d0b3770a499522abc1ad77315a228`

## Result

- **Q5 security / fail-closed review:** PASS (static)
- **Q6 architecture / ownership review:** PASS (static)
- **Q7 attempt 1:** FAIL on invalidated previous freeze `0c4913931d8fcc19f5e3676be4e3ea9c4a84b67f`
- **Q7 attempt 2:** code/repository gates PASS; final RC environment-blocked on current freeze

Q7 attempt 2 does not authorize merge because `verify:application-network-rc` did not complete. It also does not invalidate the current freeze because the remaining blocker is local Xcode developer-directory selection and requires no repository change.

## Remediation reviewed

The executable/config remediation after Q7 attempt 1 is deliberately narrow:

- the MASTER-51 publisher digest callback is typed with the public publisher SDK input type;
- the repo's existing lint policy for intentional control-character validation regexes is extended only to the exact inherited validation files reported by Enterprise RC;
- the inherited design-import regex lint exception is narrowly scoped;
- unused-variable enforcement remains enabled and only the exact inherited legacy symbol reported by the gate is handled.

No Application/Capability/runtime wire or authority semantics changed.

## Q5 — security / fail-closed review

### Cross-surface exact identity

PASS.

The proof composes existing public owners rather than creating a new semantic authority:

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

The Application Capability reference is read from the canonical discovered/verified Application artifact and used directly as the exact `capabilityId + capabilityVersion` lookup key for Capability supply. Successful hosted execution evidence must return the same exact Capability id/version.

### No floating / implicit resolution

PASS.

- canonical Application exact-reference parsing rejects floating aliases and wildcard references;
- publisher preparation parses the canonical Application before invoking the digest provider;
- MASTER-51 hardening explicitly proves `latest` and `1.x` Capability references fail before digest generation;
- Application federation uses exact Application id + release lookup;
- AI-host protocol projection compatibility remains exact id + exact versionRef;
- Capability supply exact lookup returns an empty success when the requested exact Capability release is absent;
- no provider-version substitution, latest, fallback, ranking or near-match behavior is added.

### Distribution integrity / host boundary

PASS.

The cross-surface proof uses the existing explicit external Distribution verifier before AI-host compatibility succeeds. Integrity declaration alone is not treated as verified trust. AI-host compatibility does not become authorization, entitlement, deployment or execution permission.

### Capability execution boundary

PASS.

- supply remains discovery/composition only and never invokes providers;
- hosted binding `capabilityRef` must exactly match the canonical CapabilityDefinition id/version;
- divergent binding identity fails before adapter invocation;
- action-kind Capabilities fail `ACTION_BOUNDARY_REQUIRED` and remain behind the canonical Action Boundary;
- query adapter invocation remains one-shot through the existing hosted runtime owner;
- no retry/failover or substitute-provider behavior is introduced.

### Authority-smuggling review

PASS.

The integration proof checks that discovery/compatibility/execution artifacts do not manufacture fields implying authentication, attestation, authorization, entitlement, trust/priority/fallback selection, endpoint/credential ownership or deployment permission.

Network source IDs and Capability supply source/provider/binding/location IDs remain provenance/routing only.

### RC orchestration fail-closed behavior

PASS.

`tooling/verify-application-network-rc.mjs` invokes each existing gate synchronously and exits non-zero immediately when a child gate cannot start or returns non-zero. It does not suppress failures or recursively invoke itself.

The Network RC composition remains:

1. existing Enterprise RC baseline;
2. independent external publisher proof;
3. independent external AI-host proof;
4. independent external provider proof;
5. cross-surface Application Network exact-semantics proof.

Q7 attempt 2 confirms that the orchestrator propagated the native environment failure rather than printing a false PASS.

## Q6 — architecture / ownership review

### No new semantic owner

PASS.

MASTER-51 adds an integration proof workspace and a release-gate orchestrator only. It does **not** add a new domain package or canonical noun owner.

Existing owners remain authoritative:

- `application-package` — Application identity/references/package semantics;
- `application-distribution` — Distribution/integrity envelope semantics;
- `application-publisher-sdk` — publisher-side preparation ergonomics;
- `application-federation` — public exact Application discovery/conflict semantics;
- `application-ai-host-sdk` — integrity-gated AI-host compatibility ergonomics;
- `capability-contract` — CapabilityDefinition + exact Capability reference semantics;
- `capability-supply` — exact provider-neutral Capability supply discovery/conflicts;
- `hosted-capability-runtime` — one-shot hosted query Capability execution boundary;
- `action-boundary` — protected effects.

`PACKAGE_OWNERSHIP.md` therefore requires no new owner row for MASTER-51.

### Public-root composition

PASS.

The new `@acme/vira-application-network-rc-proof` workspace depends only on public package roots needed to compose existing owners. It does not import Vira package internals via `src/*`.

### RC composition, not semantic duplication

PASS.

`verify:application-network-rc` does not implement Application, Capability, Distribution, federation, compatibility, provider or runtime semantics. It composes existing executable gates.

The existing Enterprise RC already owns repository/browser/native/device/external-brand verification. MASTER-51 reuses it and adds the Network-specific independent role proofs plus the cross-surface exact-semantics integration proof.

### Scope prohibitions

No MASTER-51 executable code introduces provider authentication/attestation, endpoint/credential catalogs, provider health/SLA/ranking/failover, commercial entitlement/pricing/settlement authority, deployment placement/autoscaling, generic cloud compute, new Action execution semantics, new protocol semantics or another Application/Capability parser.

## Current freeze and runtime evidence

Current executable/config freeze:

`952e3445d46d0b3770a499522abc1ad77315a228`

Operator-reported Q7 attempt-2 code/repository results on that exact freeze:

- boundaries PASS;
- lint PASS;
- typecheck PASS;
- cross-surface proof PASS — 2 files / 7 tests / 254ms;
- repository Vitest suite PASS — 232 files / 1311 tests / 7.62s;
- production builds PASS;
- browser E2E PASS — 1 test;
- Swift structural conformance emitted `SWIFT_CONFORMANCE_OK`.

The remaining RC failure is local Xcode environment resolution through standalone Command Line Tools. No source/config remediation follows from that failure.

## Next gate

Keep exact freeze `952e3445d46d0b3770a499522abc1ad77315a228` detached, restore full Xcode as active developer directory, confirm `xcrun --sdk macosx --show-sdk-platform-path`, then rerun `pnpm verify:application-network-rc`.

Any executable/package/test/boundary/config change after this SHA would invalidate the freeze and require another full Q7 run. Environment-only repair does not.
