# MASTER-47 — Commercial Settlement Allocation + Publisher Economics

## Goal

Add the final provider-neutral commercial-network primitive: deterministic allocation of canonical pricing quote evidence into publisher/platform economic evidence, without becoming invoice, payment, payout, subscription, tax, FX, accounting or runtime/security authority.

## Base

- authoritative `main`: `a7083edbb3bafc9326546fbba10286e696f86a06`
- previous phase: MASTER-46 merged via PR #207
- branch: `master/47-commercial-settlement`
- frozen executable/test/boundary SHA: `25ee1c25223863f3ceeb53210142acd1da331405`

## Q1 reverse engineering

`application-package` canonically owns exact Application id/version, publisher identity and exact Application references.

`commercial-pricing` canonically owns plan/rate-card arithmetic and `ViraCommercialPriceQuote` parse/serialize evidence. A quote deliberately does not prove entitlement, invoice/payment state or publisher settlement.

The repository constitution requires downstream settlement/publisher economics to consume canonical quote evidence and remain distinct from pricing and actual funds movement. MASTER-46 already closed Capability supply/discovery, so this is the final pre-proof commercial-network noun.

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

`application-package` now exposes owner-local canonical:

```text
parseViraApplicationExactReference
serializeViraApplicationExactReference
```

The public API preserves the package's existing exact-reference acceptance semantics and lets settlement consume one reference owner instead of introducing a settlement-local reference schema.

## Settlement schedule

A bounded schedule contains exact rules:

```text
settlementRef
applicationId + applicationVersion
publisherId
planRef
publisherShareBps
```

Invariants:

- exact `settlementRef` only;
- duplicate exact settlement refs fail closed;
- Application id must be namespaced and release version exact semver;
- publisherId must match the Application identity namespace;
- planRef is exact/non-floating;
- publisherShareBps is integer `0..10000`;
- rules are deterministically sorted;
- no default/latest/fallback settlement policy.

## Allocation request

A request contains canonical Application package, exact settlementRef and canonical pricing quote.

Evaluation:

- reparses the Application through `application-package`;
- reparses settlementRef through the Application exact-reference owner;
- reparses quote through `commercial-pricing`;
- requires exact rule lookup;
- requires rule Application id/version to equal canonical Application release;
- requires rule planRef to equal canonical quote planRef.

Because the rule parser already enforces Application namespace ↔ publisher parity and canonical Application parsing enforces the same invariant, a separate downstream publisher-mismatch state is intentionally unnecessary.

## Allocation arithmetic

Quote `totalAmountNanos` is gross pricing evidence.

Publisher allocation is mathematically:

```text
publisher = floor(gross × publisherShareBps / 10000)
platform  = gross - publisher
```

The implementation avoids unsafe intermediate multiplication:

```text
q = floor(gross / 10000)
r = gross % 10000
publisher = q*bps + floor(r*bps/10000)
platform = gross - publisher
```

All accepted Number operations remain within safe-integer bounds, including `Number.MAX_SAFE_INTEGER` gross. Fractional nano remainder stays with platform. No floating-point monetary ratio is used.

## Settlement allocation evidence

Canonical output contains:

- schemaVersion;
- exact settlementRef;
- exact Application id/version;
- canonical publisherId;
- publisherShareBps;
- the canonical pricing quote itself;
- publisherAmountNanos;
- platformAmountNanos.

Embedding the canonical quote avoids copying plan/currency/line/gross semantics. Allocation parse/serialize delegates quote semantics to `commercial-pricing` and exact-ref semantics to `application-package`.

The allocation parser independently verifies publisher namespace parity, canonical quote validity and exact split arithmetic.

Parsing allocation evidence validates internal semantics/arithmetic only. It does not authenticate who selected the settlement schedule/rule or prove external policy provenance.

## Q3 implementation

PASS.

Added:

- Application exact-reference owner-local parse/serialize public API;
- `@vira-enterprise-genui/commercial-settlement` package;
- bounded schedule parse/serialize;
- exact settlement-rule selection and canonical Application/plan linkage;
- safe integer basis-point allocation;
- canonical allocation evidence parse/serialize;
- executable dependency boundary.

## Q4 focused/hardening coverage

Focused suites:

```text
tests/contract/application-exact-reference.test.ts
tests/contract/commercial-settlement.test.ts
tests/contract/commercial-settlement-hardening.test.ts
```

Coverage includes exact-ref parse/freeze/serialize and floating rejection; schedule determinism; exact Application/plan linkage; publisher namespace parity; no fallback; 0/100% shares; fractional rounding; MAX_SAFE gross verified against BigInt; canonical embedded quote roundtrip; forged allocation/quote rejection; payment/payout/tax/FX/credential/authority smuggling; rule ceiling; and accessor/custom-prototype fail-closed behavior.

Local execution remains Q7; no test pass counts are claimed yet.

## Q5 security review

PASS on frozen executable/test/boundary head `25ee1c25223863f3ceeb53210142acd1da331405`.

Evidence: `docs/evidence/MASTER-47/Q5_Q6_REVIEW.md`.

Key results:

- shared safe JSON parsing and exact shapes;
- canonical Application/quote/reference owner delegation;
- exact rule selection/no fallback;
- safe-integer allocation without unsafe gross-by-share multiplication;
- independent allocation arithmetic verification;
- no payment/payout/tax/FX/credential/security authority smuggling;
- evidence parsing does not claim policy provenance authentication.

## Q6 architecture/ownership review

PASS on the same frozen head.

Canonical owner chain:

```text
application-package    → Application release/publisher/reference semantics
commercial-entitlement → commercial eligibility
commercial-metering    → usage/rating truth
commercial-pricing     → rate-card + quote evidence
commercial-settlement  → deterministic publisher/platform allocation evidence
```

Settlement is allocation evidence only; actual invoices, payments, payouts, processor/bank settlement, subscriptions, refunds, tax/FX and accounting remain outside this core owner.

## Authority / non-goals

Settlement allocation evidence is **not**:

- proof that a user was commercially entitled;
- invoice creation;
- payment intent/capture;
- funds movement;
- publisher payout;
- bank/processor settlement;
- subscription/refund state;
- tax/VAT calculation;
- FX conversion;
- accounting/revenue recognition;
- authorization/governance/runtime permission.

## Q7 local gate

Run only against exact frozen SHA:

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
- Q3 PASS — owner-local exact-reference surface + settlement implementation.
- Q4 PASS — focused/hardening coverage added and statically reviewed.
- Q5 PASS — security/fail-closed review.
- Q6 PASS — architecture/ownership review.
- Q7 PENDING — exact frozen-head local gate.
- Q8 — independent PR reverse engineering + closure compare.
- Q9 — exact-head squash merge and verify new authoritative main.
