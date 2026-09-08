# PROD-21 — Multi-party Settlement and Reconciliation

**Status:** LOCAL ROOT VERIFIED / HOSTED EXACT-HEAD CI PENDING
**Dependency:** PROD-20 merged at `main@6a259750`

`commercial-settlement` remains the canonical owner. Publisher, provider, model, node and platform shares use integer nanos and basis points; deterministic remainder belongs to the platform share so allocations always equal the gross amount.

Signed external payment, refund and payout events are verified, deduplicated and sequence-checked. Allocation evidence is explicitly `allocation-only` with `fundsMoved: false`; reconciliation records are a separate `reconciliation-only` type. Tax, FX, bank operations, funds capture and accounting ledger authority are out of scope.

Required gates are `verify:multi-party-commerce` and `verify:payment-reconciliation`. Live provider webhook and production financial-system gates remain open.
