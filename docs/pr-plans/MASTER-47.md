# MASTER-47 — Commercial Settlement Allocation + Publisher Economics

## Goal

Add the final provider-neutral commercial-network primitive: deterministic allocation of canonical pricing quote evidence into publisher/platform economic evidence, without becoming invoice, payment, payout, subscription, tax, FX, accounting or runtime/security authority.

## Base

- authoritative `main`: `a7083edbb3bafc9326546fbba10286e696f86a06`
- previous phase: MASTER-46 merged via PR #207
- branch: `master/47-commercial-settlement`
- draft PR: #208
- frozen executable/test/boundary SHA: `25ee1c25223863f3ceeb53210142acd1da331405`

## Canonical ownership

```text
application-package    → Application release/publisher/reference semantics
commercial-entitlement → commercial eligibility
commercial-metering    → usage/rating truth
commercial-pricing     → rate-card + quote evidence
commercial-settlement  → deterministic publisher/platform allocation evidence
```

Executable dependency boundary:

```text
commercial-settlement
  → application-package
  → commercial-pricing
  → protocol
```

No executable dependency on entitlement/metering, governance/runtime/Action owners, Capability supply/runtime, telemetry/action-ledger, deployment, payment processors, banks, tax/FX providers or cloud SDKs.

## Application exact-reference owner extension

`application-package` exposes owner-local canonical:

```text
parseViraApplicationExactReference
serializeViraApplicationExactReference
```

The API preserves the package's existing exact-reference semantics and lets settlement consume one reference owner instead of introducing a settlement-local reference schema.

## Settlement contract

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

A request contains canonical Application package, exact settlementRef and canonical pricing quote. Evaluation reparses every canonical artifact through its owner, requires exact rule lookup, exact Application release match and exact quote planRef match.

## Allocation arithmetic

Quote `totalAmountNanos` is gross pricing evidence.

```text
publisher = floor(gross × publisherShareBps / 10000)
platform  = gross - publisher
```

Implementation avoids unsafe intermediate multiplication:

```text
q = floor(gross / 10000)
r = gross % 10000
publisher = q*bps + floor(r*bps/10000)
platform = gross - publisher
```

Accepted operations remain safe-integer bounded including `Number.MAX_SAFE_INTEGER` gross. Fractional nano remainder stays with platform. No floating-point monetary ratio is used.

## Settlement allocation evidence

Canonical output contains schemaVersion, exact settlementRef, exact Application id/version, publisherId, publisherShareBps, the canonical pricing quote itself, publisherAmountNanos and platformAmountNanos.

Embedding the canonical quote avoids copying pricing semantics. Allocation parse/serialize delegates quote semantics to `commercial-pricing` and exact-ref semantics to `application-package`. The allocation parser independently verifies publisher namespace parity, canonical quote validity and exact split arithmetic.

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

## Q5/Q6

PASS on frozen executable/test/boundary head `25ee1c25223863f3ceeb53210142acd1da331405`.

Evidence: `docs/evidence/MASTER-47/Q5_Q6_REVIEW.md`.

## Q7 local gate

PASS on the same exact frozen SHA.

The repository operator ran the full boundaries/typecheck/focused-suite command set detached at `25ee1c25223863f3ceeb53210142acd1da331405` and reported it green. No counts/timings are reconstructed.

Evidence: `docs/evidence/MASTER-47/Q7_LOCAL_PASS.md`.

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

## Q0–Q9

- Q0 PASS — fresh branch from exact authoritative main `a7083edbb3bafc9326546fbba10286e696f86a06`.
- Q1 PASS — remaining commercial gap and owner reverse engineering.
- Q2 PASS — settlement owner, exact-linkage model and allocation arithmetic frozen.
- Q3 PASS — owner-local exact-reference surface + settlement implementation.
- Q4 PASS — focused/hardening coverage added and statically reviewed.
- Q5 PASS — security/fail-closed review.
- Q6 PASS — architecture/ownership review.
- Q7 PASS — exact frozen-head local gate, operator-reported green.
- Q8 ACTIVE — independent PR reverse engineering + closure compare.
- Q9 — exact-head squash merge and verify new authoritative main.
