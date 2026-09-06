# PROD-09 — Async Capability Jobs and Minimum Provider Trust

**Status:** TECHNICAL CLOSURE / NOT MERGE AUTHORIZED  
**Dependency head:** `20386b7f98774048e93e5b4dbfd66166ef2030a0`  
**Dependencies represented:** PROD-07 + PROD-08  
**Branch:** `prod/09-async-capability-provider-trust`

## Authority freeze

- `provider-connection` remains the owner of connection identity, enterprise scope, SecretRef metadata, granted scopes and pending/active/revoked/expired lifecycle.
- `provider-trust` owns only bounded trust evidence and exact trust evaluation for an already canonical provider connection.
- `hosted-capability-runtime` remains the hosted query execution owner and extends that owner with `inline | async-job` delivery rather than duplicating execution semantics.
- Async Capability retry remains query-only. Protected Action retry remains outside this phase and must continue through later Action/Transaction owners.
- Provider trust is not governance authorization, entitlement, Action execution authority or provider receipt verification.

## Delivered

- Minimum `provider-trust`: exact connection/provider/scope/credential parity, health, issue/expiry/revocation and bounded trust validity.
- `hosted-capability-runtime` delivery modes `inline | async-job`.
- Durable async job start/read/result/cancel-request/cancel-confirmation/timeout state.
- Poll and webhook completion through one CAS state machine.
- Replay-safe duplicate completion and explicit late-completion rejection.
- Explicit cancellation ambiguity: `cancel-requested` is distinct from `cancelled`, and provider completion can win the race before cancellation confirmation.
- Executable `query-safe` retry guard that keeps protected Actions behind the canonical Action Boundary.
- PostgreSQL async job persistence with canonical-record validation, tenant scope, FORCE RLS, worker-only writes, revision CAS and no delete grant.
- Live worker/API recreation evidence showing durable resume across process boundaries.
- Fail-closed provider authority on poll and cancellation, including idempotent cancel replay after the Q8 ordering hardening.

## Quality gates

- `verify:provider-trust` ✅
- `verify:async-capability-job` ✅
- PostgreSQL store contract ✅
- migration/live RLS + CAS + worker/API restart ✅
- duplicate completion ✅
- late completion ✅
- timeout ✅
- cancellation ambiguity ✅
- revoked/mismatched provider authority ✅
- iOS native ✅
- Android native ✅
- native portable conformance ✅
- repository/browser root verification ✅
- independent Q8 reverse-engineering/QC ✅

Pre-history-cleanup exact evidence: CI `#1936` succeeded on `bb5f067410e7b2f28fef5c15c3a9756c4f6f45c7`.

## Closure invariant

The PROD-09 branch is accepted only while it remains one clean PROD-09 commit whose direct parent is exact PROD-08 head `20386b7f98774048e93e5b4dbfd66166ef2030a0`, with a successful fresh CI run on that exact clean head.

This phase remains **NOT MERGE AUTHORIZED** until a separate merge decision is made.

## Explicit non-goals

No protected provider Action execution, Transaction Approval, durable Action retry, one-time execution grant, pricing/billing, provider postcondition verification or Action Ledger expansion is introduced by PROD-09.
