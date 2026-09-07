# PROD-14 Q5/Q6 — Security and Architecture Review

**Source candidate:** `053c35e`
**Status:** PASS for code/contract scope; live release gates remain out of scope.

## Q5 — Security

- Billable input is restricted to canonical verified Action evidence; telemetry, logs and raw provider receipts remain non-authoritative.
- Source identity is duplicate-safe and conflict detecting. Invoice lines additionally require `sourceEventId === usageId` and exact tenant/customer/Application binding.
- Monetary values use non-negative safe integer nanos. Floating currency, overflow, exact-reference drift and currency mismatch fail closed.
- Invoice exports are content-addressed, immutable revisions. PostgreSQL grants worker `SELECT, INSERT` only; API/ops receive read-only tenant-scoped access.
- Migration `000012` uses FORCE RLS and binds relational identity, scope, digests and totals back to canonical JSON evidence.
- Nullable publisher/provider/model/node/platform attribution remains null when evidence is absent; display/log inference is forbidden.

## Q6 — Architecture

- `commercial-metering` remains trusted usage/rating owner.
- `commercial-pricing` owns deterministic invoice-grade price/usage evidence and canonical content hashing; it does not import settlement semantics or payment authority.
- Settlement is referenced only by exact evidence references; `allocation != funds moved` remains explicit.
- `integrations/postgres` persists immutable evidence and supplies queries without becoming commercial semantic authority.
- `000011` was not rewritten; invoice storage is the forward-only `000012` migration.
- No billing/payment/tax/FX/accounting owner was introduced.

The implementation satisfies the PROD-14 trust, ownership, arithmetic, immutability and tenant-isolation invariants. No executable Q5/Q6 blocker remains.
