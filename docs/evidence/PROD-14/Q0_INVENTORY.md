# PROD-14 Q0 — Inventory and gap analysis

Parent exact SHA: `4b733a5979917251d04936610f2a2370eb27a18a`

## Roadmap requirement

PROD-14 requires trusted evidence normalization into `commercial-metering`, duplicate-safe usage source events/records/rating, deterministic pricing/settlement evidence, nullable attribution, customer usage/budget/quota surfaces and invoice-grade export. Telemetry/receipts must not become automatically billable.

## Existing canonical owners

### commercial-metering
Already owns:
- exact `meteringRef` definitions;
- units: count/token/byte/millisecond;
- windows: lifetime/UTC day/UTC month;
- canonical usage batch/record shapes;
- duplicate `usageId` rejection;
- quantity overflow protection;
- deterministic usage rating against entitlement/meter limits;
- rating evidence helpers.

Current gap:
- `ViraCommercialUsageRecord` accepts `sourceId` as a string but has no production trusted-source evidence contract;
- no durable source-event inbox/idempotency authority;
- no explicit evidence class preventing raw telemetry/HTTP receipt from being billed;
- no provider/model/node/platform attribution fields.

### commercial-pricing
Already owns:
- exact `planRef`;
- currency;
- fixed nanos and nanos-per-unit rates;
- deterministic pricing over metering ratings;
- amount overflow protection;
- quote evidence.

Current gap:
- no production batch binding from durable canonical usage/source evidence;
- no invoice/export identity or stable export digest.

### commercial-settlement
Already owns:
- exact settlementRef/application/publisher/plan binding;
- integer basis-points allocation;
- publisher/platform allocation evidence.

Current gap:
- only publisher/platform allocation is modeled today; PROD-14 attribution is evidence-only and must not prematurely turn this package into PROD-21 multi-party settlement;
- allocation must remain separate from payment/funds movement.

## Production persistence

No production durable `usage_source_events` / canonical commercial usage persistence is present in the current PROD-13 migration stream. Existing Postgres integration owns durable adapters and tenant RLS; PROD-14 should add migration/adapters there rather than create a storage semantic owner.

## Trusted upstream evidence available from prior phases

Useful source families include:
- durable Application/run identity and exact application resolution;
- provider/connection trust evidence;
- async Capability completion evidence;
- protected Action execution + independent verification truth from PROD-13;
- Action Ledger transaction/operation/attempt evidence.

Not billable by themselves:
- logs/metrics/traces;
- UI telemetry;
- provider HTTP response/receipt;
- unverified `accepted` write result;
- arbitrary client-supplied quantity.

## Main risks

1. Double billing from duplicate/out-of-order delivery.
2. A generic `sourceId` being forgeable without exact evidence identity.
3. Meter/plan/currency refs drifting between usage and rating.
4. Integer overflow in quantity × nanos/rating aggregation.
5. Hidden attribution invention when provider/model/node is absent.
6. Invoice export being mistaken for payment/tax/accounting authority.
7. Telemetry becoming a shadow billing owner.

## Q0 conclusion

The nearest-owner rule is sufficient: extend existing commercial owners and add Postgres adapters. The first implementation gap is a canonical trusted usage-source evidence contract plus duplicate-safe durable ingestion. No new broad billing semantic package is justified.
