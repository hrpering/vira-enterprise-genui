# MASTER-45 — Commercial Pricing + Rate Card

## Goal

Introduce the canonical provider-neutral monetary pricing boundary downstream of commercial entitlement/metering without creating invoice/payment/subscription/payout authority or mutating usage truth.

## Base

- authoritative `main`: `f1ee6ec68b9c1a53f3413b9f201eae355517fc52`
- previous phase: MASTER-44 merged via PR #205
- branch: `master/45-commercial-pricing`

## Q1 reverse engineering

### Entitlement

`commercial-entitlement` already owns exact `planRef` selection as part of commercial eligibility, but the plan reference is intentionally opaque. It does not own currency, price/rate cards, monetary totals, invoices or payments.

### Metering

`commercial-metering` owns exact meter definitions and canonical non-monetary ratings (`used / limit / remaining / excess`). Its rating output deliberately contains no monetary price.

A downstream pricing owner must consume canonical rating evidence and never reconstruct usage from telemetry or Action receipts.

The current metering owner exposes rating generation but no parser/serializer for persisted/transmitted rating evidence. MASTER-45 will extend that existing owner with a canonical rating parse/serialize surface rather than duplicate the rating shape inside pricing.

### Application / marketplace

`application-package` carries exact entitlement/metering references but no price schema. Legacy `experience-marketplace` is Experience-catalog search/discovery and must not become Application/Capability commercial economics authority.

## Q2 owner freeze

New canonical owner:

```text
@vira-enterprise-genui/commercial-pricing
```

Executable dependencies:

```text
commercial-pricing
  → application-package
  → commercial-metering
  → protocol
```

`commercial-metering` remains the rating owner and receives only the missing canonical rating parser/serializer extension.

## Pricing model

A price catalog contains exact plans. Each plan contains:

- exact `planRef`;
- lexical three-letter uppercase `currency` code;
- non-negative safe-integer `fixedAmountNanos`;
- bounded per-meter rates.

One currency unit equals `1_000_000_000` pricing nanos. This keeps core arithmetic integer-only and avoids floating-point money. Core validates currency syntax only; it does not claim ISO membership, FX rates or legal tender authority.

A meter rate contains:

- exact `meteringRef`;
- basis `used | excess`;
- non-negative safe-integer `amountNanosPerUnit`.

`excess` pricing consumes the canonical metering rating's `excessQuantity`; `used` pricing consumes `usedQuantity`.

## Quote request

A pricing request contains:

- exact `planRef`;
- canonical UTC `asOf`;
- canonical serialized commercial-metering ratings.

Every plan rate must have exactly one matching rating. Undeclared extra ratings, duplicate ratings or missing ratings fail closed. Every rating must have the same `asOf` as the quote request.

## Quote evidence

The deterministic result contains:

- exact plan ref;
- currency;
- as-of timestamp;
- fixed nanos;
- deterministic line items;
- total nanos.

Line amount is `quantity × amountNanosPerUnit` with pre-multiplication safe-integer overflow checks. Total accumulation also fails closed on overflow.

A quote is **pricing evidence only**. It is not:

- an invoice;
- a payment intent;
- a captured charge;
- a subscription state;
- a settlement/payout;
- tax/FX/accounting authority;
- authorization/governance/runtime permission;
- commercial entitlement itself.

Repeated quote evaluation never mutates usage, entitlement or payment state.

## Non-goals

MASTER-45 does not implement payment providers, invoices, taxes, FX, refunds, subscription lifecycle, publisher settlement, revenue share, provider payouts, marketplace ranking, provider discovery or generic billing infrastructure.

## Planned verification

```bash
pnpm check:boundaries
pnpm typecheck
pnpm vitest run \
  tests/contract/commercial-metering-rating-evidence.test.ts \
  tests/contract/commercial-pricing.test.ts \
  tests/contract/commercial-pricing-hardening.test.ts
```

## Q0–Q9

- Q0 PASS — fresh branch from exact authoritative main `f1ee6ec68b9c1a53f3413b9f201eae355517fc52`.
- Q1 PASS — entitlement/metering/marketplace owner reverse engineering.
- Q2 PASS — pricing owner + integer-nanos contract frozen.
- Q3 NEXT — metering rating evidence interoperability + pricing package.
- Q4 — focused/hardening coverage.
- Q5 — security/fail-closed review.
- Q6 — architecture/ownership review.
- Q7 — exact frozen-head local gate.
- Q8 — independent PR reverse engineering + closure compare.
- Q9 — exact-head squash merge and verify new authoritative main.
