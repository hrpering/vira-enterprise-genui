# MASTER-51 — Q5/Q6 Security + Architecture Review

**Date:** 2026-09-05  
**Phase:** MASTER-51 — Cross-Surface Exact Semantics + Application Network RC  
**Authoritative base SHA:** `6f02e4437210c0cd662f1852759c88fca328462c`  
**Reviewed executable/config SHA:** `952e3445d46d0b3770a499522abc1ad77315a228`  
**Previous freeze (invalidated):** `0c4913931d8fcc19f5e3676be4e3ea9c4a84b67f`

## Result

- **Q5 security / fail-closed review:** PASS (static, after Q7 attempt-1 remediation)
- **Q6 architecture / ownership review:** PASS (static, after Q7 attempt-1 remediation)
- **Q7:** RERUN REQUIRED on the reviewed SHA above
- **Q8:** BLOCKED until the new Q7 passes

Q7 attempt 1 is recorded separately in `docs/evidence/MASTER-51/Q7_ATTEMPT_1_FAIL.md`.

## Q7 attempt-1 findings re-reviewed

The first local run exposed two classes of executable failure:

1. a MASTER-51-owned TypeScript error in the new cross-surface proof callback;
2. seven inherited ESLint failures inside the existing Enterprise RC baseline.

The MASTER-51 callback now uses the public `ViraApplicationPublisherDigestInput` type exported by `application-publisher-sdk`. This is a type-only correction and does not introduce a second digest or Distribution contract.

The Enterprise RC lint failures were in source files that were not part of the pre-Q7 MASTER-51 executable diff. They therefore pre-existed on authoritative `main`, but MASTER-51 cannot waive them because `verify:application-network-rc` intentionally requires `verify:enterprise-rc` to pass.

The remediation extends the repository's existing validation-file lint policy only to the exact intentional control-character-regex files reported by the operator. It also scopes the existing design-import escape rule exception to that exact file and keeps the TypeScript unused-variable rule enabled while ignoring only the exact inherited `ViraCommercialEntitlementSet` type symbol. No broad lint disable, directory ignore or test bypass was added.

## Q5 — security / fail-closed review

### Cross-surface exact identity

PASS.

The proof still composes existing public owners only:

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

The canonical Application Capability reference is used directly as the Capability supply lookup key. Successful hosted execution evidence must retain the same exact Capability id/version.

### No floating / implicit resolution

PASS.

- canonical Application exact-reference parsing rejects floating aliases and wildcard references;
- publisher preparation validates the canonical Application before digest-provider invocation;
- MASTER-51 hardening proves `latest` and `1.x` Capability refs fail before digest generation;
- federation lookup remains exact Application id + release;
- AI-host protocol compatibility remains exact id + exact versionRef;
- Capability supply exact misses return empty success;
- no latest, substitute provider, fallback, ranking or near-match behavior is introduced.

### Distribution integrity / host boundary

PASS.

The proof requires the existing explicit external Distribution verifier before AI-host compatibility succeeds. Integrity declaration alone is not authentication or trust.

### Capability execution boundary

PASS.

- supply remains discovery only and never invokes providers;
- hosted binding `capabilityRef` must exactly match CapabilityDefinition identity/version;
- divergent binding identity fails before adapter invocation;
- action Capabilities remain behind `action-boundary`;
- hosted query adapter invocation remains one-shot;
- no retry/failover/substitution is introduced.

### Authority smuggling

PASS.

No proof/gate artifact acquires authentication, attestation, authorization, entitlement, provider trust, endpoint/credential, deployment or generic cloud authority. Source/provider/binding/location identifiers remain provenance/routing only.

### RC orchestration

PASS.

`tooling/verify-application-network-rc.mjs` remains a synchronous fail-fast gate compositor:

1. `verify:enterprise-rc`;
2. `verify:external-publisher-proof`;
3. `verify:external-ai-host-proof`;
4. `verify:external-provider-proof`;
5. `verify:application-network-cross-surface`.

The orchestrator does not implement domain semantics and does not suppress child failures.

## Q6 — architecture / ownership review

### No new semantic owner

PASS.

MASTER-51 remains an integration/release phase. Existing canonical owners are unchanged:

- `application-package` — Application identity/reference/package semantics;
- `application-distribution` — Distribution/integrity envelope;
- `application-publisher-sdk` — publisher preparation ergonomics;
- `application-federation` — public exact Application discovery/conflict semantics;
- `application-ai-host-sdk` — integrity-gated compatibility ergonomics;
- `capability-contract` — CapabilityDefinition + exact Capability refs;
- `capability-supply` — exact supply discovery/conflicts;
- `hosted-capability-runtime` — one-shot hosted query execution;
- `action-boundary` — protected effects.

No ownership row or domain package is added.

### Public-root composition

PASS.

The `@acme/vira-application-network-rc-proof` workspace consumes public Vira package roots only. The new type annotation also consumes a public SDK export rather than importing an implementation file.

### Baseline lint remediation boundary

PASS.

The lint-policy changes are repository verification hygiene, not product semantics:

- the existing `no-control-regex` override is extended only to the reported intentional validation files;
- `no-useless-escape` is disabled only for the existing design-import token regex file;
- `@typescript-eslint/no-unused-vars` remains enabled for `commercial-entitlement`, with a single exact legacy type-name ignore pattern;
- no package dependency, runtime API, wire contract, authority, fallback or execution behavior changes.

## Executable/config remediation diff

Relative to invalidated freeze `0c4913931d8fcc19f5e3676be4e3ea9c4a84b67f`, executable/config changes through reviewed SHA `952e3445d46d0b3770a499522abc1ad77315a228` are limited to:

- `examples/application-network-rc/application-network-rc.test.ts` — type the publisher digest callback with the public SDK type;
- `eslint.config.mjs` — narrow lint-policy alignment required by the existing Enterprise RC baseline.

Other changes between those SHAs are docs/evidence only.

## Next gate

A full Q7 rerun must execute on exact detached SHA:

`952e3445d46d0b3770a499522abc1ad77315a228`

The old Q7 attempt and old freeze cannot authorize final merge. Any executable/package/test/boundary/config change after this SHA invalidates the new freeze and requires another Q7 rerun.
