# MASTER-43 — Commercial Usage Metering + Rating

## Goal

Introduce the canonical provider-neutral commercial usage truth and deterministic entitlement-limit rating boundary for exact Vira Application releases.

MASTER-43 owns:

```text
meter definition
+ explicit commercial usage records
+ deterministic usage window aggregation
+ entitlement-limit rating
+ used / limit / remaining / excess
```

It does **not** own telemetry/observability, Action audit truth, authentication, authorization, governance, runtime/deployment permission, provider invocation, monetary pricing, currency, invoice/payment state, subscription lifecycle or publisher payouts.

## Base

- authoritative `main`: `e7598b99bd44b138911113a66179001946186f56`
- previous phase: MASTER-42 merged via PR #202
- branch: `master/43-usage-rating-metering`
- next commercial phases remain MASTER-44..47

## Q1 reverse engineering

### Application Package

`ViraApplicationPackage.commercial.meteringRefs[]` already declares exact Application meter identities. MASTER-43 consumes those references; it does not add inline meter definitions or usage state to the Application package.

### Commercial Entitlement

MASTER-42 owns commercial eligibility and exact `{ meteringRef, quantity }` limit declarations. It deliberately does not define meter unit/window semantics, mutable usage, remaining quota or rating.

MASTER-43 consumes the canonical entitlement evaluator rather than duplicating entitlement matching.

### Telemetry

`telemetry` owns operational events with:

```text
name + source + kind + outcome + occurredAt + optional durationMs
```

It does not carry commercial meter identity, quantity, entitlement identity, plan identity or billable usage semantics. Telemetry events are not commercial usage truth.

### Experience Observability

`experience-observability` maps canonical Experience lifecycle/action names into Telemetry events. It remains observability, not commercial accounting.

### Action Ledger

`action-ledger` owns ordered Experience/Action/governance/audit/replay evidence. It can project telemetry, but it does not define billable units or commercial usage. A protected Action receipt is not automatically a billable-usage record.

### Capability Contract

`capability-contract` owns provider-neutral invocation semantics only. It does not own meters or commercial accounting.

## Frozen MASTER-43 owner

New package:

```text
@vira-enterprise-genui/commercial-metering
```

Intended executable dependencies:

```text
commercial-metering
  → application-package
  → commercial-entitlement
  → enterprise-context
  → protocol
```

No dependency on telemetry, experience-observability, action-ledger, governance, runtime, deployment, federation, provider adapters or payment/billing providers.

## Meter definition

A bounded canonical meter catalog contains exact versioned meter definitions.

Each meter definition contains:

- exact `meteringRef`;
- provider-neutral unit;
- deterministic aggregation window.

Initial unit vocabulary:

```text
count | token | byte | millisecond
```

Semantic meaning beyond the base unit remains in the exact meter identity. For example input-token and output-token usage should normally be separate exact meter identities rather than hidden unit variants.

Initial window vocabulary:

```text
lifetime | utc-day | utc-month
```

No customer-local timezone or subscription billing-cycle window is inferred. Such lifecycle semantics require a separately owned subscription/commercial lifecycle contract.

## Commercial usage record

Usage records are explicit commercial data, never inferred automatically from telemetry or Action Ledger entries.

Each record contains:

- stable `usageId` for idempotency;
- provenance-only `sourceId`;
- `occurredAt` UTC timestamp;
- exact Application id + release version;
- exact `entitlementRef`;
- exact `meteringRef`;
- canonical enterprise principal + scope;
- optional exact Capability ref;
- optional location id;
- positive safe-integer quantity.

`sourceId` is provenance only. Parsing a record does not authenticate the source, verify a signature or prove provider truth.

Duplicate `usageId` values fail closed. There is no last-write-wins correction behavior in the canonical core.

## Rating request

One rating request evaluates exactly one exact `meteringRef` for one exact entitlement context at one UTC `asOf` instant.

The rating boundary:

1. validates the canonical Application package;
2. requires the requested meter to be declared in Application `commercial.meteringRefs[]`;
3. resolves exactly one meter definition from the meter catalog;
4. evaluates the supplied entitlement set through the existing MASTER-42 evaluator;
5. requires the commercial decision to be `entitled`;
6. validates every supplied usage record against the same exact Application / entitlement / enterprise scope / principal / Capability / location / meter context;
7. applies the meter's deterministic UTC window;
8. sums safe-integer usage quantities in-window;
9. reads the matching entitlement limit, if present;
10. returns deterministic usage rating evidence.

Supplying records from another meter/context is an error rather than silently filtering cross-scope commercial data. Records outside the selected time window are valid historical input and are excluded deterministically.

## Rating result

Rating is **commercial usage-to-entitlement rating**, not monetary pricing.

Result fields include:

```text
meteringRef
unit
window
windowStart
windowEnd
asOf
usedQuantity
limitQuantity | null
remainingQuantity | null
excessQuantity
status
```

Status vocabulary:

```text
unlimited | within-limit | limit-reached | over-limit
```

No currency, unit price, charge, invoice, payout or payment field exists in MASTER-43.

## Exact/non-authority invariants

- exact Application release only;
- exact entitlement and metering references only;
- no implicit latest/range/fallback;
- commercial entitlement is re-evaluated through its canonical owner;
- a rating result does not authorize execution or override governance;
- meter source provenance is not source authentication;
- telemetry/observability/action receipts are not automatically billable usage;
- usage records are immutable canonical inputs for the rating operation;
- duplicate usage ids fail closed;
- quantity arithmetic must remain within JavaScript safe integers;
- no negative/decimal usage;
- no monetary pricing or payment semantics;
- no subscription billing-cycle inference;
- unknown authority/provider/payment fields fail closed through exact shapes.

## Planned focused verification

```bash
pnpm check:boundaries
pnpm typecheck
pnpm vitest run \
  tests/contract/commercial-metering.test.ts \
  tests/contract/commercial-metering-hardening.test.ts
```

## Q0–Q9

- Q0 PASS — fresh branch from exact authoritative main `e7598b99bd44b138911113a66179001946186f56`.
- Q1 PASS — Application/entitlement/telemetry/observability/action-ledger/Capability ownership reverse engineering.
- Q2 PASS — commercial metering/rating boundary frozen in this document.
- Q3 NEXT — implement `commercial-metering`.
- Q4 — focused metering/window/rating/non-authority/hardening tests.
- Q5 — security/fail-closed review.
- Q6 — architecture/ownership review.
- Q7 — exact frozen-head local boundaries/typecheck/focused tests.
- Q8 — independent PR reverse engineering + executable-clean closure compare.
- Q9 — exact-head squash merge, verify new authoritative main, then start MASTER-44 fresh from it.
