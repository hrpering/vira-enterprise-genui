# PROD-09 Q0 — Baseline

- Dependency head: `20386b7f98774048e93e5b4dbfd66166ef2030a0`.
- Dependency contents: verified PROD-07 Provider Connection + fully closed PROD-08 durable runtime.
- PROD-08 exact-head CI: #1910 GREEN.
- PROD-09 roadmap dependency: PROD-07 + PROD-08.
- Existing `hosted-capability-runtime` is the canonical hosted query execution owner and currently executes one-shot inline query results.
- Existing `provider-connection` owns provider/connector identity, enterprise scope, SecretRef metadata, granted scopes, operation bindings and pending/active/revoked/expired lifecycle.
- New `provider-trust` is permitted by the production owner matrix beginning in PROD-09.

## Q0 invariant

PROD-09 may add durable async query delivery and provider trust evidence without creating a second Capability runtime, re-owning provider connection lifecycle, or allowing protected Action retry/execution through the query path.
