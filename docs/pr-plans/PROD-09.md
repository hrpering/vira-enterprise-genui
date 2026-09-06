# PROD-09 — Async Capability Jobs and Minimum Provider Trust

**Status:** ACTIVE STACKED IMPLEMENTATION / NOT MERGE AUTHORIZED  
**Dependency head:** `20386b7f98774048e93e5b4dbfd66166ef2030a0`  
**Dependencies represented:** PROD-07 + PROD-08  
**Branch:** `prod/09-async-capability-provider-trust`

## Authority freeze

- `provider-connection` remains the owner of connection identity, enterprise scope, SecretRef metadata, granted scopes and pending/active/revoked/expired lifecycle.
- New `provider-trust` owns only bounded trust evidence and exact trust evaluation for an already canonical provider connection.
- `hosted-capability-runtime` remains the hosted query execution owner and will be extended with `inline | async-job` delivery rather than duplicated.
- Async Capability retry remains query-only. Protected Action retry remains outside this phase and must continue through later Action/Transaction owners.
- Provider trust is not governance authorization, entitlement, Action execution authority or provider receipt verification.

## Required delivery

- Minimum `provider-trust`: exact connection/provider/scope/credential parity, health, issue/expiry/revocation.
- `hosted-capability-runtime` delivery modes `inline | async-job`.
- Durable job start/status/result/cancel-request/timeout.
- Poll and webhook completion.
- Long-running reference query workload.
- Executable guard separating query retry from protected Action retry.

## Quality gates

- `verify:provider-trust`
- `verify:async-capability-job`
- worker/API restart
- duplicate completion
- late completion
- timeout
- cancellation ambiguity
- revoked connection

## Explicit non-goals

No protected provider Action execution, Transaction Approval, durable Action retry, one-time execution grant, pricing/billing, provider postcondition verification or Action Ledger expansion is introduced by PROD-09.
