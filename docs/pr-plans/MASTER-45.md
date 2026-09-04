# MASTER-45 — Commercial Pricing + Rate Card

## Goal

Introduce the canonical provider-neutral monetary pricing boundary downstream of commercial entitlement/metering without creating invoice/payment/subscription/payout authority or mutating usage truth.

## Base

- authoritative `main`: `f1ee6ec68b9c1a53f3413b9f201eae355517fc52`
- previous phase: MASTER-44 merged via PR #205
- branch: `master/45-commercial-pricing`
- draft PR: #206
- current frozen executable SHA: `0984b0145381f8344dc458cd28d3e1b26db79e78`
- invalidated previous freeze: `5876a177a5c14dfa4ae90d1b1e2a618c01d30eb2`

## Q1 reverse engineering

### Entitlement

`commercial-entitlement` already owns exact `planRef` selection as part of commercial eligibility, but the plan reference is intentionally opaque. It does not own currency, price/rate cards, monetary totals, invoices or payments.

### Metering

`commercial-metering` owns exact meter definitions and canonical non-monetary ratings (`used / limit / remaining / excess`). Its rating output deliberately contains no monetary price.

A downstream pricing owner must consume canonical rating evidence and never reconstruct usage from telemetry or Action receipts.

The metering owner previously exposed rating generation but no parser/serializer for persisted/transmitted rating evidence. MASTER-45 extends that existing owner with canonical rating parse/serialize rather than duplicate rating shape inside pricing.

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

No executable dependency on `commercial-entitlement`, governance/runtime/Action owners, telemetry/action-ledger, hosted Capability runtime, marketplace search, deployment, payment providers or cloud/provider SDKs.

The absence of direct entitlement dependency is intentional: pricing consumes an explicitly selected exact `planRef`; producing a quote does not prove entitlement to that plan.

## Pricing model

A price catalog contains exact plans. Each plan contains:

- exact `planRef`;
- lexical three-letter uppercase `currency` code;
- non-negative safe-integer `fixedAmountNanos`;
- bounded per-meter rates.

One currency unit equals `1_000_000_000` pricing nanos. This keeps core arithmetic integer-only and avoids floating-point money. Core validates currency syntax only; it does not claim ISO membership, FX rates or legal-tender authority.

A meter rate contains:

- exact `meteringRef`;
- basis `used | excess`;
- non-negative safe-integer `amountNanosPerUnit`.

`excess` pricing consumes canonical `excessQuantity`; `used` pricing consumes canonical `usedQuantity`.

## Canonical rating evidence

`commercial-metering` now owns:

```text
parseViraCommercialUsageRating
serializeViraCommercialUsageRating
```

The parser validates the existing rating semantics rather than defining a pricing-local rating schema:

- exact metering reference;
- canonical unit/window/status;
- canonical UTC `asOf` and window bounds;
- safe-integer quantities;
- included-record bound;
- zero/nonzero included-record ↔ used-quantity consistency;
- `usedQuantity >= includedRecordCount`, because every canonical included usage record has positive quantity;
- used/limit/remaining/excess/status consistency.

Evidence validation does not authenticate the source of the rating.

## Quote request

A pricing request contains:

- exact `planRef`;
- canonical UTC `asOf`;
- canonical commercial-metering ratings.

Every plan rate must have exactly one matching rating. Undeclared extra ratings, duplicate ratings or missing ratings fail closed. Every rating must have the same `asOf` as the quote request.

## Quote evidence

The deterministic result contains:

- exact plan ref;
- currency;
- as-of timestamp;
- fixed nanos;
- deterministic line items;
- total nanos.

Line amount is `quantity × amountNanosPerUnit` with a safe-integer guard **before multiplication**. Total accumulation also fails before overflow.

`commercial-pricing` owns canonical quote parsing/serialization:

```text
parseViraCommercialPriceQuote
serializeViraCommercialPriceQuote
```

The quote parser independently verifies line arithmetic, duplicate line identities and total arithmetic, so future invoice/settlement phases do not need to copy the pricing shape.

A quote is **pricing evidence only**. It is not:

- an invoice;
- a payment intent/capture;
- a subscription state;
- a settlement/payout;
- tax/FX/accounting authority;
- authorization/governance/runtime permission;
- commercial entitlement itself.

Repeated quote evaluation never mutates usage, entitlement or payment state.

## Q3 implementation

PASS.

Added:

- canonical metering rating evidence parser/serializer;
- `@vira-enterprise-genui/commercial-pricing` package;
- exact plan/rate catalog parser + deterministic serializer;
- integer-nanos `used | excess` quote evaluator;
- canonical quote evidence parser/serializer;
- executable dependency boundary.

## Q4 focused/hardening coverage

Focused suites:

```text
tests/contract/commercial-metering-rating-evidence.test.ts
tests/contract/commercial-pricing.test.ts
tests/contract/commercial-pricing-hardening.test.ts
```

Coverage includes rating roundtrip/canonical UTC/window/status semantics; impossible rating count/usage evidence; floating refs; accessor/custom-prototype rejection; deterministic price catalogs; fixed + used pricing; excess pricing; fixed-only pricing; deterministic ordering; quote evidence roundtrip; duplicate/missing/extra ratings; rating-time mismatch; canonical rating parser delegation; invalid currency/money; pre-multiplication and total overflow; forged quote line/total arithmetic; duplicate quote lines; authority/payment/tax/credential smuggling; and collection bounds.

Q8 remediation added explicit coverage rejecting `usedQuantity < includedRecordCount`.

## Q5 security review

PASS on the original pre-Q7 executable surface. Evidence: `docs/evidence/MASTER-45/Q5_Q6_REVIEW.md`.

Key results:

- untrusted data uses shared safe JSON parsing;
- exact shapes reject payment/security authority smuggling;
- monetary arithmetic is safe-integer only and overflow checked before precision loss;
- quote evidence revalidates line and total arithmetic;
- parsing evidence does not authenticate its source;
- pricing cannot mutate usage/entitlement/payment state.

The Q8 hardening change stays within the same canonical metering evidence owner and narrows accepted evidence; it does not expand authority or dependencies.

## Q6 architecture/ownership review

PASS. Executable dependency authority remains:

```text
commercial-pricing → application-package, commercial-metering, protocol
```

Canonical owner chain remains:

```text
commercial-entitlement  → exact commercial eligibility + planRef
commercial-metering     → usage truth + non-monetary rating evidence
commercial-pricing      → rate-card + monetary quote evidence
future layers           → invoice/payment/subscription/settlement/payout
```

No layer inherits security/runtime authority from the commercial chain.

## Q7 attempt 1

PASS on exact frozen executable SHA:

```text
5876a177a5c14dfa4ae90d1b1e2a618c01d30eb2
```

The repository operator reran the full local boundaries/typecheck/focused-suite command set detached at that exact SHA and reported it green. Evidence: `docs/evidence/MASTER-45/Q7_LOCAL_PASS.md`.

That PASS is retained as historical evidence but is **invalidated for final merge purposes** because Q8 found an executable consistency gap and the parser/tests changed afterward.

## Q8 attempt 1

FAIL. Evidence: `docs/evidence/MASTER-45/Q8_ATTEMPT_1.md`.

Independent reverse engineering found that the rating evidence parser could accept `usedQuantity < includedRecordCount`, although canonical usage records require every included `quantity` to be a positive safe integer. Canonical producer output therefore guarantees:

```text
usedQuantity >= includedRecordCount
```

The canonical metering evidence parser was hardened to enforce this invariant and the focused suite was extended with the forged-evidence case.

No other blocker was found in the reviewed pricing/quote/arithmetic/dependency/authority surface. PR #206 had no submitted reviews or inline review threads at the review point. Hosted CI remained infrastructure non-signal because the jobs exposed no executed steps.

## Current frozen executable

New frozen executable SHA:

```text
0984b0145381f8344dc458cd28d3e1b26db79e78
```

Any changes after this SHA must be documentation/evidence only. The full local gate must be rerun detached at this exact SHA before Q8 restarts.

## Q7 rerun command

```bash
pnpm check:boundaries
pnpm typecheck
pnpm vitest run \
  tests/contract/commercial-metering-rating-evidence.test.ts \
  tests/contract/commercial-pricing.test.ts \
  tests/contract/commercial-pricing-hardening.test.ts
```

## Non-goals

MASTER-45 does not implement payment providers, invoices, taxes, FX, refunds, subscription lifecycle, publisher settlement, revenue share, provider payouts, marketplace ranking, provider discovery or generic billing infrastructure.

## Q0–Q9

- Q0 PASS — fresh branch from exact authoritative main `f1ee6ec68b9c1a53f3413b9f201eae355517fc52`.
- Q1 PASS — entitlement/metering/marketplace owner reverse engineering.
- Q2 PASS — pricing owner + integer-nanos contract frozen.
- Q3 PASS — rating interoperability + pricing/quote package surfaces implemented.
- Q4 PASS — focused/hardening coverage added; Q8 added one producer-consistency hardening case.
- Q5 PASS — security/fail-closed architecture remains intact; prior review evidence retained.
- Q6 PASS — ownership/dependency boundary unchanged.
- Q7 RERUN PENDING — exact new frozen-head local gate required after Q8 executable fix.
- Q8 BLOCKED — restart only after new Q7 PASS.
- Q9 — exact-head squash merge and verify new authoritative main.
