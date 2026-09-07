# PROD-09 — Q8 Reverse-Engineering Closure

**Status:** TECHNICAL CLOSURE EVIDENCE / NOT MERGE AUTHORIZED  
**Dependency head:** `20386b7f98774048e93e5b4dbfd66166ef2030a0`  
**Pre-closure implementation head:** `bb5f067410e7b2f28fef5c15c3a9756c4f6f45c7`  
**Fresh CI:** `#1936` — SUCCESS

## Independent review scope

Q8 re-read the PROD-09 boundaries as one system rather than trusting focused tests in isolation:

- `provider-trust` evidence parsing and exact connection/provider/scope/credential parity;
- hosted async Capability job identity, lifecycle, retry and completion state machine;
- protected Action exclusion and query-only retry boundary;
- PostgreSQL durable job decoding, row/canonical-record parity, revision CAS and tenant identity;
- migration `000005_prod09_async_capability_job.sql`, FORCE RLS and API/worker privileges;
- in-memory semantic tests, PostgreSQL contract tests and live restart/RLS/CAS evidence.

## Q8 finding and correction

Q8 found one fail-closed ordering defect in `requestCancel()`.

The operation is an authorized provider mutation, but a job already in `cancel-requested` state could return idempotent replay success before provider authority was re-evaluated. A caller with the current revision could therefore receive replay success with expired/revoked or mismatched provider authority. No state mutation occurred, but the ordering violated the provider-authority boundary.

The correction is intentionally narrow:

1. keep tenant identity and expected-revision checks unchanged;
2. evaluate current provider authority before any `cancel-requested` replay result;
3. preserve the existing idempotent replay only after authority succeeds;
4. leave all other state transitions unchanged.

Regression coverage now proves that a `cancel-requested` replay fails closed with:

- `PROVIDER_AUTHORITY_REVOKED` for expired/revoked authority;
- `PROVIDER_AUTHORITY_MISMATCH` for a different provider connection.

## Other Q8 conclusions

No additional blocker was found in the reviewed PROD-09 boundaries.

- Provider trust remains a bounded trust decision, not governance or Action authorization.
- Protected Actions remain outside async Capability execution/retry and continue to require the canonical Action Boundary.
- Completion replay remains read-only/idempotent: it returns the stored canonical terminal state and does not mutate caller-supplied drift.
- PostgreSQL persistence re-validates canonical job shape and row identity before returning state.
- Mutation persistence remains revision-CAS based and tenant scoped.
- API remains read-only for async job state; worker owns insert/update and has no delete grant.
- Cancellation ambiguity remains explicit: `cancel-requested` is not treated as `cancelled`, and provider completion may win the race before cancellation confirmation.

## Exact verification evidence

Fresh CI `#1936` ran on exact implementation head `bb5f067410e7b2f28fef5c15c3a9756c4f6f45c7` and completed successfully.

The run included successful gates for:

- production PostgreSQL migration/live verification, including PROD-09 durable job restart/RLS/CAS/cancellation-ambiguity proof;
- identity and browser security;
- portable artifact drift;
- native portable conformance;
- iOS native build;
- Android native build/test;
- repository and browser root verification, including provider-trust and async Capability job regression tests.

## Closure rule

This evidence authorizes PROD-09 technical-history cleanup only. It does **not** authorize merge. The final PROD-09 branch must be reduced to one clean commit on exact dependency head `20386b7f98774048e93e5b4dbfd66166ef2030a0`, followed by a fresh exact-head CI run before the PR can be considered technically ready.
