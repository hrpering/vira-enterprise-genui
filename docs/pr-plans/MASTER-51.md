# MASTER-51 — Cross-Surface Exact Semantics + Application Network RC

**Status:** Q0–Q6 PASS / Q7 RERUN PENDING / Q8 BLOCKED  
**Base SHA:** `6f02e4437210c0cd662f1852759c88fca328462c`  
**Frozen executable/config SHA:** `952e3445d46d0b3770a499522abc1ad77315a228`  
**Invalidated previous freeze:** `0c4913931d8fcc19f5e3676be4e3ea9c4a84b67f`  
**Branch:** `master/51-network-rc`  
**PR:** #212 (draft)

## Goal

Close the Application Network roadmap by proving one exact semantic chain across publisher, federation, AI-host compatibility, Capability supply and hosted query execution, then compose all existing Enterprise + Network verification gates into one fail-closed Application Network RC command.

MASTER-51 is a closure/integration phase, not a new semantic package or owner.

## Canonical cross-surface chain

```text
external publisher
        ↓
application-publisher-sdk
        ↓ canonical Distribution
application-federation exact lookup
        ↓
application-ai-host-sdk
        ↓ explicit Distribution integrity verification
canonical Application.capabilities exact reference
        ↓
capability-supply exact provider/location lookup
        ↓
hosted-capability-runtime one-shot query execution
        ↓
execution evidence with the same exact Capability id@version
```

## Application Network RC

```text
verify:application-network-rc
  ├─ verify:enterprise-rc
  ├─ verify:external-publisher-proof
  ├─ verify:external-ai-host-proof
  ├─ verify:external-provider-proof
  └─ verify:application-network-cross-surface
```

The RC orchestrator owns no semantic truth itself and fails immediately when a child gate fails.

## Implementation and coverage

MASTER-51 adds only integration/release surfaces:

- `examples/application-network-rc/package.json`;
- `examples/application-network-rc/application-network-rc.test.ts`;
- `examples/application-network-rc/application-network-rc-hardening.test.ts`;
- `tooling/verify-application-network-rc.mjs`;
- root `verify:application-network-cross-surface` and `verify:application-network-rc` scripts.

Coverage proves exact Application discovery, explicit Distribution integrity verification, exact protocol compatibility, direct Application Capability `id@version` → Capability supply lookup, no provider fallback/substitution, one-shot hosted execution, exact execution evidence identity, binding mismatch rejection, Action Boundary rejection, floating Application Capability rejection before digest generation, and absence of invented auth/trust/commercial/deployment authority.

## Q5–Q6

Static security/architecture review was repeated after Q7 attempt-1 remediation and remains PASS on:

`952e3445d46d0b3770a499522abc1ad77315a228`

Evidence: `docs/evidence/MASTER-51/Q5_Q6_REVIEW.md`.

## Q7 attempt 1 — FAIL

The operator ran exact previous freeze:

`0c4913931d8fcc19f5e3676be4e3ea9c4a84b67f`

Evidence: `docs/evidence/MASTER-51/Q7_ATTEMPT_1_FAIL.md`.

Reported facts:

- workspace install completed;
- boundaries PASS;
- typecheck FAIL with TS7006 in the new publisher digest callback;
- cross-surface proof PASS: 2 test files / 7 tests / 220ms as reported by the operator;
- Application Network RC FAIL inside Enterprise RC baseline because ESLint reported 7 inherited errors.

The previous freeze is invalid for final merge authority.

## Remediation

Executable/config remediation is deliberately narrow:

1. `examples/application-network-rc/application-network-rc.test.ts`
   - imports public `ViraApplicationPublisherDigestInput`;
   - explicitly types the digest callback parameter.

2. `eslint.config.mjs`
   - extends the existing intentional `no-control-regex` override only to the exact validator files reported by the baseline;
   - scopes `no-useless-escape` override to the existing design-import regex file;
   - keeps `@typescript-eslint/no-unused-vars` enabled while ignoring only exact legacy symbol `ViraCommercialEntitlementSet` in `commercial-entitlement`.

No wire schema, dependency graph, runtime behavior, provider selection, Action authority, authentication, entitlement or deployment semantics changed.

## New Q7 authority

A **full** local rerun is required on exact detached SHA:

`952e3445d46d0b3770a499522abc1ad77315a228`

The old Q7 PASS/FAIL outputs are historical evidence only. Q8 remains blocked until this exact new freeze passes.

## Q8–Q9 after rerun PASS

- re-read PR #212 independently from scratch;
- inspect current executable/config diff and adjacent canonical owners;
- inspect reviews/threads/comments;
- classify current-head hosted Actions;
- prove new freeze → closure executable/package/test/boundary/config drift is zero;
- if Q8 PASS, run final Q9 docs-only closure compare;
- mark PR ready and squash merge only with fresh exact `expected_head_sha`;
- independently verify resulting authoritative `main` and close the Application Network roadmap.
