# MASTER-47 — Commercial Settlement Allocation + Publisher Economics

## Goal

Add the final provider-neutral commercial-network primitive: deterministic allocation of canonical pricing quote evidence into publisher/platform economic evidence, without becoming invoice, payment, payout, subscription, tax, FX, accounting or runtime/security authority.

## Base

- authoritative `main`: `a7083edbb3bafc9326546fbba10286e696f86a06`
- previous phase: MASTER-46 merged via PR #207
- branch: `master/47-commercial-settlement`

## Q1 reverse engineering

### Application publisher

`application-package` canonically owns exact Application id/version and publisher `{ id, name }`.

### Pricing

`commercial-pricing` canonically owns exact plan/rate-card arithmetic and `ViraCommercialPriceQuote` parse/serialize evidence. A quote deliberately does not prove entitlement, invoice/payment state or publisher settlement.

### Remaining commercial gap

The repository constitution explicitly requires future invoice/payment/settlement layers to consume canonical quote evidence and keeps pricing, settlement and publisher economics distinct semantic owners. Capability supply is already closed by MASTER-46, so the remaining pre-proof commercial noun is deterministic publisher economics/settlement allocation evidence.

Generic payment-provider integration is not a Vira core semantic owner.

## Q2 owner freeze

New canonical owner:

```text
@vira-enterprise-genui/commercial-settlement
```

Executable dependencies:

```text
commercial-settlement
  → application-package
  → commercial-pricing
  → protocol
```

No executable dependency on entitlement/metering, governance/runtime/Action owners, Capability supply/runtime, telemetry/action-ledger, deployment, payment processors, banks, tax/FX providers or cloud SDKs.

## Application exact-reference owner extension

Settlement schedule rules need exact `settlementRef` and exact `planRef`. MASTER-47 must not copy Application exact-reference validation.

`application-package` will expose canonical:

```text
parseViraApplicationExactReference
serializeViraApplicationExactReference
```

using its existing internal exact-reference semantics. This is an owner-local API extension, not a new reference schema.

## Settlement schedule

A bounded schedule contains exact rules. Each rule contains:

- exact `settlementRef`;
- exact Application `applicationId + applicationVersion`;
- canonical Application `publisherId`;
- exact `planRef`;
- integer `publisherShareBps` from `0..10000`.

Rules are selected only by exact `settlementRef`. Duplicate exact settlement refs fail closed. There is no default/latest/fallback settlement policy.

## Request

A settlement allocation request contains:

- canonical Application package;
- exact `settlementRef`;
- canonical commercial-pricing quote.

Evaluation requires:

- exact settlement rule exists;
- rule Application id/version equals canonical Application package;
- rule publisherId equals canonical Application publisher id;
- rule planRef exactly equals canonical quote planRef.

## Allocation arithmetic

Quote `totalAmountNanos` is gross pricing evidence.

Publisher allocation uses integer basis points only:

```text
publisher = floor(gross × publisherShareBps / 10000)
platform  = gross - publisher
```

Implementation must avoid unsafe intermediate multiplication. Compute with quotient/remainder decomposition so all Number operations remain within safe-integer bounds.

Rounding rule is explicit: fractional nano remainder stays with platform. No floating-point money.

## Settlement allocation evidence

Canonical output contains:

- schema version;
- exact settlementRef;
- exact Application id/version;
- publisherId;
- publisherShareBps;
- the canonical pricing quote itself;
- publisherAmountNanos;
- platformAmountNanos.

Embedding the canonical quote avoids copying plan/currency/line/gross semantics and binds the allocation to one exact quote artifact.

`commercial-settlement` owns parse/serialize of this allocation evidence and independently verifies allocation arithmetic.

## Authority / non-goals

Settlement allocation evidence is **not**:

- proof that a user was commercially entitled;
- invoice creation;
- payment intent/capture;
- funds movement;
- publisher payout;
- bank/processor settlement;
- subscription state;
- refund state;
- tax/VAT calculation;
- FX conversion;
- accounting/revenue recognition;
- authorization/governance/runtime permission.

It is deterministic economic allocation evidence over an already-canonical quote.

## Planned verification

```bash
pnpm check:boundaries
pnpm typecheck
pnpm vitest run \
  tests/contract/application-exact-reference.test.ts \
  tests/contract/commercial-settlement.test.ts \
  tests/contract/commercial-settlement-hardening.test.ts
```

## Q0–Q9

- Q0 PASS — fresh branch from exact authoritative main `a7083edbb3bafc9326546fbba10286e696f86a06`.
- Q1 PASS — remaining commercial gap and owner reverse engineering.
- Q2 PASS — settlement owner, exact-linkage model and allocation arithmetic frozen.
- Q3 NEXT — owner-local exact-reference export + settlement implementation.
- Q4 — focused/hardening coverage.
- Q5 — security/fail-closed review.
- Q6 — architecture/ownership review.
- Q7 — exact frozen-head local gate.
- Q8 — independent PR reverse engineering + closure compare.
- Q9 — exact-head squash merge and verify new authoritative main.
