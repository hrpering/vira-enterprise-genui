# MASTER-43 — Commercial Usage Metering + Rating

## Goal

Introduce the canonical provider-neutral commercial usage truth and deterministic entitlement-limit rating boundary for exact Vira Application releases.

MASTER-43 owns:

```text
meter definition
+ explicit commercial usage records
+ append-only usage idempotency contract
+ deterministic usage window aggregation
+ entitlement-limit rating
+ used / limit / remaining / excess
```

It does **not** own telemetry/observability, Action audit truth, authentication, authorization, governance, runtime/deployment permission, provider invocation, monetary pricing, currency, invoice/payment state, subscription lifecycle or publisher payouts.

## Base

- authoritative `main`: `e7598b99bd44b138911113a66179001946186f56`
- previous phase: MASTER-42 merged via PR #202
- branch: `master/43-usage-rating-metering`
- PR: #204
- frozen executable head: `2d3e7933fc4c8ab619771a07dc926ef94fc2cfde`
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

Executable dependencies:

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
- `occurredAt` canonical UTC timestamp;
- exact Application id + release version;
- exact `entitlementRef`;
- exact `meteringRef`;
- canonical enterprise principal + scope;
- optional exact Capability ref;
- optional location id;
- positive safe-integer quantity.

`sourceId` is provenance only. Parsing a record does not authenticate the source, verify a signature or prove provider truth.

Duplicate `usageId` values fail closed. There is no last-write-wins correction behavior in the canonical core.

A single canonical usage batch is bounded to `2_048` records. This ceiling is intentionally below the shared protocol safe-JSON node budget for the full canonical record shape. Larger accounting histories are represented through repeated bounded ledger appends rather than by bypassing the shared parser with oversized single payloads.

## Append-only usage ledger contract

`createViraCommercialUsageLedger()` provides the domain-level append/idempotency contract without becoming durable storage infrastructure.

- initial records must parse through the canonical usage-batch parser;
- each append reuses the canonical record parser;
- `usageId` must remain unique for the lifetime of that ledger instance;
- malformed or duplicate appends do not mutate ledger state;
- snapshots are detached, frozen and deterministically ordered;
- no update/delete/reversal or implicit correction semantics exist in v1;
- database/storage/replication durability remains an integration concern outside this package.

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

Supplying records from another meter/context is an error rather than silently filtering cross-scope commercial data. Records outside the selected time window are valid same-context historical input and are excluded deterministically.

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
includedRecordCount
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
- usage records are immutable canonical inputs for rating;
- ledger append is idempotent by `usageId` and append-only;
- single usage batches remain below the canonical domain ceiling and always pass through the shared safe JSON parser;
- quantity arithmetic must remain within JavaScript safe integers;
- no negative/decimal usage;
- no monetary pricing or payment semantics;
- no subscription billing-cycle inference;
- unknown authority/provider/payment fields fail closed through exact shapes.

## Q5 security / fail-closed review

PASS.

- all meter, usage and rating request input enters through shared safe JSON parsing;
- exact shapes reject authorization, pricing, payment and fake source-trust fields;
- floating entitlement/meter/Capability references fail closed;
- duplicate meters and usage ids fail closed;
- unsafe timestamps and non-positive/fractional/unsafe quantities fail closed;
- aggregate quantity overflow fails rather than clamping/wrapping;
- cross-Application/entitlement/meter/principal/scope/Capability/location records fail rather than silently contaminating rating;
- only same-context records outside the selected time window are excluded;
- source provenance is not authentication or integrity proof;
- ledger append failures do not mutate prior usage truth;
- the Q7 bound remediation lowers the commercial single-batch ceiling instead of introducing a safe-parser bypass.

## Q6 architecture / ownership review

PASS.

Executable dependency authority declares only:

```text
commercial-metering → application-package, commercial-entitlement, enterprise-context, protocol
```

There is deliberately no executable edge to `telemetry`, `experience-observability`, `action-ledger`, governance, runtime, deployment, federation or billing/payment/provider code.

`application-package` remains exact Application/meter-reference owner. `commercial-entitlement` remains eligibility/limit owner. `enterprise-context` remains principal/scope owner. `telemetry` and `action-ledger` retain their operational/audit meanings. Monetary economics remain future downstream concerns.

The append-only usage ledger is a domain idempotency contract only; it does not introduce a database, external transport or durable infrastructure owner.

## Q7 focused verification

### Attempt 1

Frozen executable SHA:

```text
a62aeeb6068edb8d0df123ee3b86a0186e464c3c
```

Operator-reported local result:

- boundaries PASS;
- typecheck PASS;
- focused tests: 22 passed / 1 failed;
- failed hardening assertion expected `USAGE_LIMIT_EXCEEDED` but received `INVALID_INPUT` for the oversized usage-batch case.

Root cause: the initial `10_000` commercial batch ceiling was above what the shared `JSON_VALUE_MAX_NODES = 100_000` safety budget can represent for a full canonical usage record array. Evidence is recorded in `docs/evidence/MASTER-43/Q7_ATTEMPT_1.md`.

### Remediation and new freeze

`VIRA_COMMERCIAL_METERING_MAX_USAGE_RECORDS` is now `2_048`. No parser bypass was introduced.

New frozen executable SHA:

```text
2d3e7933fc4c8ab619771a07dc926ef94fc2cfde
```

Rerun exactly:

```bash
pnpm check:boundaries
pnpm typecheck
pnpm vitest run \
  tests/contract/commercial-metering.test.ts \
  tests/contract/commercial-metering-hardening.test.ts \
  tests/contract/commercial-metering-ledger.test.ts
```

Q7 remains PENDING until the exact new frozen SHA passes locally.

## Q0–Q9

- Q0 PASS — fresh branch from exact authoritative main `e7598b99bd44b138911113a66179001946186f56`.
- Q1 PASS — Application/entitlement/telemetry/observability/action-ledger/Capability ownership reverse engineering.
- Q2 PASS — commercial metering/rating boundary frozen.
- Q3 PASS — meter catalog, usage parser/serializer, append-only ledger and deterministic rating implemented.
- Q4 PASS — focused metering/window/rating/ledger/non-authority/hardening coverage added.
- Q5 PASS — security/fail-closed static review, including post-Q7 remediation review.
- Q6 PASS — architecture/ownership review + executable dependency boundary.
- Q7 PENDING RERUN — attempt 1 failed one bound assertion; executable remediation frozen at `2d3e7933fc4c8ab619771a07dc926ef94fc2cfde`.
- Q8 — independent PR reverse engineering + executable-clean closure compare after Q7 evidence.
- Q9 — exact-head squash merge, verify new authoritative main, then start MASTER-44 fresh from it.
