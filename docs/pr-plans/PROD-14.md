# PROD-14 — Verified commercial usage, pricing and invoice export

Parent branch: `prod/13-real-provider-write-postcondition-action-ledger`
Parent exact SHA: `4b733a5979917251d04936610f2a2370eb27a18a`

> Dependency note: PROD-13 base/full repository verification is green on the parent SHA, but its live PostgreSQL closure evidence is intentionally deferred. PROD-14 may progress as a stacked development branch, but cannot be technically closed before the deferred PROD-13 live dependency gate is closed.

## Goal

Turn trusted canonical execution/usage evidence into deterministic, duplicate-safe commercial usage, pricing and invoice-grade export without allowing telemetry, receipts or unverified provider responses to become billable authority.

## Existing owners to extend

- `commercial-metering`: usage normalization, meter semantics, usage records/rating.
- `commercial-pricing`: deterministic exact-ref pricing in integer nanos.
- `commercial-settlement`: deterministic allocation evidence; funds movement remains out of scope.
- `integrations/postgres`: durable source-event/usage/export persistence only; never semantic authority.

No new `billing-core`, `usage-core`, or `invoice-core` semantic owner is permitted unless Q1 proves no existing owner fits.

## Required production invariants

1. Billable usage requires trusted source evidence and an exact commercial chain.
2. Telemetry, logs, provider HTTP receipts and raw action responses are never billable by themselves.
3. One source event can create at most one canonical usage record per exact tenant/meter/billing identity.
4. Duplicate or out-of-order source delivery cannot double bill.
5. Usage quantity and money arithmetic are integer-safe; no floating-point currency arithmetic.
6. Pricing uses exact plan/meter refs and exact currency identity.
7. Publisher/provider/model/node/platform attribution is nullable evidence, not required invented data.
8. Invoice export is deterministic evidence over canonical rated usage; it is not payment or tax authority.
9. Budget/quota preflight may deny or challenge future usage but cannot rewrite historical usage.
10. Existing settlement allocation remains evidence; `allocation != funds moved`.

## Delivery sequence

### Q0 — inventory / gap analysis
Freeze existing meter/pricing/settlement contracts, current persistence, current evidence surfaces and duplication risks.

### Q1 — target architecture
Freeze trusted usage source contract, persistence keys, normalization boundary, invoice export contract and failure semantics.

### Q2 — trusted usage evidence
Extend `commercial-metering` with a bounded canonical trusted usage source event that binds exact tenant/application/run/execution/evidence/commercial references.

### Q3 — duplicate-safe durable ingestion
Add PostgreSQL source-event inbox and canonical usage persistence with unique source identity and exact tenant RLS.

### Q4 — deterministic rating/pricing chain
Bind canonical usage records to existing meter definitions and exact pricing refs; reject drift, currency mismatch and overflow.

### Q5 — attribution and budget/quota preflight
Add nullable provider/model/node/platform attribution and explicit preflight result without making telemetry authoritative.

### Q6 — invoice-grade export
Produce deterministic export lines/batches from canonical priced usage, including exact refs/digests and stable ordering.

### Q7 — evidence and closure tooling
Required focused gates:
- `verify:commercial-e2e`
- `verify:billing-export`

Full exact-head local closure follows existing production/local gate discipline. PROD-14 cannot be marked technically closed while the parent PROD-13 live dependency remains open.

## Explicitly out of scope

- Payment capture or payout.
- Tax calculation/compliance.
- FX conversion.
- Bank/accounting ledger.
- Inventing missing provider/model/node attribution.
- Treating logs/telemetry as invoice authority.
- PROD-20/21 machine acquisition/payment reconciliation.

## Status

PROVISIONAL CODE-COMPLETE CANDIDATE / EVIDENCE-HEAD HOSTED CI REQUIRED / LIVE RELEASE GATES OPEN.

Implemented delivery includes trusted usage, duplicate-safe persistence, deterministic history/rating/preflight, invoice-grade canonical export, immutable PostgreSQL export revisions and the focused `verify:commercial-e2e` / `verify:billing-export` gates. Production RC authority remains blocked by `docs/production/LIVE_GATE_BLOCKERS.md`.
