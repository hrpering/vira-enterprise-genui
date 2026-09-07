# PROD-14 Q1 — Target architecture

## Canonical flow

```text
trusted execution / capability / verified Action evidence
                    │
                    ▼
       commercial-metering source normalizer
                    │
                    ▼
        TrustedUsageSourceEvent (canonical)
                    │
                    ▼
     PostgreSQL duplicate-safe source inbox
                    │
                    ▼
       canonical CommercialUsageRecord
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
 budget/quota preflight   usage history
          │
          ▼
 commercial-metering rating
          │
          ▼
 commercial-pricing exact quote
          │
          ▼
 commercial-settlement allocation evidence
          │
          ▼
 deterministic invoice-grade export
```

## Ownership

- Source-event normalization and billability semantics: `commercial-metering`.
- Rating: `commercial-metering`.
- Price math and currency identity: `commercial-pricing`.
- Allocation evidence: `commercial-settlement`.
- Durable tables/RLS/idempotency: `integrations/postgres`.
- Export composition may live in `commercial-pricing` if it is price/usage evidence only; no new owner unless implementation proves broader semantics.

## TrustedUsageSourceEvent v1

Required identity:

```text
version
scope
sourceEventId
sourceKind
sourceAuthority
occurredAt
applicationRef
applicationDigest
entitlementRef
meteringRef
principal
quantity
capabilityRef?
runId?
executionId?
transactionId?
operationId?
verificationId?
evidenceDigest
attribution {
  publisherId?
  providerId?
  modelId?
  nodeId?
  platformId?
}
```

Source kinds are an explicit allowlist. The normalizer must reject unsupported evidence rather than accept a generic arbitrary payload.

Initial production source kinds:
- `capability.completed`
- `action.effect.verified`

`action.dispatch.accepted`, `provider.receipt`, `telemetry`, `log`, `metric` are not billable source kinds.

## Durable idempotency

Primary source identity is exact tenant + `sourceEventId`. A duplicate with byte-equivalent canonical evidence returns duplicate/accepted without another usage record. Same source ID with different canonical evidence is conflict/fail-closed.

Canonical usage identity is derived from the accepted source event, not caller supplied independently.

## Out-of-order behavior

Source events may arrive out of order. Usage history orders by `occurredAt` plus stable source identity. Rating/export must be deterministic for the same bounded source set and `asOf`.

Late events may produce a new export revision; historical export artifacts are immutable and never silently rewritten.

## Arithmetic

- Quantities: safe integers only.
- Currency: exact uppercase ISO-like canonical token already enforced by pricing owner.
- Price: integer nanos only.
- Multiplication/addition must reject safe-integer overflow.
- No JS floating-point money values are persisted or exported as authority.

## Attribution

Attribution fields are nullable and evidence-bound. Missing provider/model/node/platform identity remains null; runtime may not infer it from display names, logs or topology.

## Budget/quota preflight

Preflight reads canonical usage/rating and returns one of:
- `allowed`
- `limit-reached`
- `over-budget`
- `insufficient-evidence`

It is advisory/authorization evidence for future work and cannot alter historical usage. Enforcement remains with the consuming Action/Capability boundary.

## Invoice-grade export

Export is deterministic evidence, not an invoice payment/tax engine.

Required export identity:

```text
exportVersion
exportId
scope
customer/principal identity
periodStart / periodEnd
currency
applicationRefs[]
sourceSetDigest
usageLines[]
priceLines[]
settlementEvidenceRefs[]
subtotalNanos
totalAmountNanos
createdAt
```

Stable canonical ordering is mandatory. The same source set + exact refs + asOf/period produces the same canonical amount/line content. Export ID may be caller/business assigned, but content digest is deterministic.

## Failure semantics

- forged source authority → reject
- duplicate exact source → accepted duplicate, zero extra billable effect
- duplicate conflicting source → conflict
- unverified action receipt → reject
- exact-ref drift → reject
- currency mismatch → reject
- quantity/amount overflow → reject
- missing attribution → preserve null, do not reject unless contract requires it
- late source → new rating/export revision, never mutate old immutable export

## Persistence sketch

```text
vira.commercial_usage_source_event
vira.commercial_usage_record
vira.commercial_invoice_export
```

All tenant scoped with FORCE RLS. Source and usage tables are append-only except narrowly defined processing metadata if required. Invoice exports are immutable once inserted.

## Quality gates

`verify:commercial-e2e`
- verified action source accepted
- unsupported telemetry rejected
- duplicate exact source does not double bill
- conflicting duplicate rejected
- out-of-order events deterministic
- exact-ref drift/currency/overflow negatives

`verify:billing-export`
- stable line ordering/digest
- same source set = same content
- immutable historical export
- nullable attribution preserved
- settlement allocation remains evidence only

## Dependency constraint

PROD-14 can be developed on this stacked branch, but technical closure is blocked until PROD-13's deferred live PostgreSQL closure is completed on its parent exact SHA.
