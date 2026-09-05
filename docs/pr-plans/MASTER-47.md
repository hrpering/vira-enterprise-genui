# MASTER-47 — Commercial Settlement Allocation + Publisher Economics

## Goal

Add the final provider-neutral commercial-network primitive: deterministic allocation of canonical pricing quote evidence into publisher/platform economic evidence, without becoming invoice, payment, payout, subscription, tax, FX, accounting or runtime/security authority.

## Base

- authoritative `main`: `a7083edbb3bafc9326546fbba10286e696f86a06`
- previous phase: MASTER-46 merged via PR #207
- branch: `master/47-commercial-settlement`
- PR: #208
- frozen executable/test/boundary SHA: `95c9a0674742c702cc5265b8e1fb35f82dea04ad`
- invalidated previous freeze: `b42ae481700094f118328f111f8011ab44136877`
- earlier invalidated freeze: `25ee1c25223863f3ceeb53210142acd1da331405`

## Canonical ownership

```text
application-package    → Application release/publisher/exact-reference semantics
commercial-entitlement → commercial eligibility
commercial-metering    → usage/rating truth
commercial-pricing     → rate-card + canonical quote evidence
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

## Owner remediation history

Q8 attempt 1 found duplicate exact-reference parser implementations. `application-package` now owns one canonical `parseViraApplicationExactReference` / `serializeViraApplicationExactReference`, and `parseViraApplicationPackage` delegates nested exact refs to it while preserving contextual error paths.

Evidence: `docs/evidence/MASTER-47/Q8_ATTEMPT_1.md`.

Q8 attempt 2 found duplicated Application release id/version validation inside settlement. `application-package` now owns canonical `parseViraApplicationReleaseReference` / `serializeViraApplicationReleaseReference`; the Application package root, settlement schedule and allocation evidence all delegate to this owner. Settlement-local release regex/validation was removed.

Evidence: `docs/evidence/MASTER-47/Q8_ATTEMPT_2.md`.

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
- Application release id/version must pass the canonical Application release-reference owner;
- publisherId must match the Application identity namespace;
- planRef is exact/non-floating;
- publisherShareBps is integer `0..10000`;
- rules are deterministically sorted;
- no default/latest/fallback settlement policy.

Allocation requests contain canonical Application package, exact settlementRef and canonical pricing quote. Evaluation reparses each canonical artifact through its owner, requires exact rule lookup, exact Application release match and exact quote planRef match.

## Allocation arithmetic

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

## Allocation evidence

Canonical allocation evidence contains schemaVersion, exact settlementRef, exact Application id/version, publisherId, publisherShareBps, canonical pricing quote, publisherAmountNanos and platformAmountNanos.

Parsing/serialization delegates quote semantics to `commercial-pricing`, exact-reference semantics to the Application exact-reference owner, and Application id/version semantics to the Application release-reference owner. The parser independently verifies split arithmetic.

Evidence parsing validates internal semantics/arithmetic only. It does not authenticate settlement-policy provenance.

## Focused verification surface

```text
tests/contract/application-exact-reference.test.ts
tests/contract/application-release-reference.test.ts
tests/contract/commercial-settlement.test.ts
tests/contract/commercial-settlement-hardening.test.ts
```

Coverage includes owner/package/settlement parity, nested path preservation, deterministic schedule/evidence serialization, exact Application/plan linkage, publisher namespace parity, no fallback, 0/100% and fractional rounding, MAX_SAFE arithmetic checked against BigInt, forged quote/allocation rejection, payment/payout/tax/FX/credential/authority smuggling, rule ceiling and unsafe-object handling.

## Q5/Q6

PASS on frozen executable/test/boundary head `95c9a0674742c702cc5265b8e1fb35f82dea04ad`.

Evidence: `docs/evidence/MASTER-47/Q5_Q6_REVIEW.md`.

## Q7

Final exact-head local Q7 PASS on `95c9a0674742c702cc5265b8e1fb35f82dea04ad`, operator-reported green only; no counts/timings reconstructed.

Evidence: `docs/evidence/MASTER-47/Q7_FINAL_RERUN_PASS.md`.

Historical Q7 passes on `25ee1c25223863f3ceeb53210142acd1da331405` and `b42ae481700094f118328f111f8011ab44136877` remain invalidated for final merge because later executable/test remediations changed the freeze.

## Q8

Final independent Q8 PASS after both owner remediations.

Evidence: `docs/evidence/MASTER-47/Q8_FINAL_REVIEW_PASS.md`.

Confirmed:

- one canonical exact-reference implementation;
- one canonical Application release-reference implementation;
- exact settlement/plan/Application linkage;
- canonical pricing quote delegation;
- safe deterministic allocation arithmetic;
- allocation evidence integrity checks;
- narrow dependency graph;
- no entitlement/payment/payout/tax/FX/accounting/runtime/security authority creep;
- no PR reviews, review threads or comments;
- hosted Actions current-head failure is infrastructure non-signal because all jobs expose `steps=null`;
- frozen-to-pre-closure branch diff is documentation/evidence only.

## Authority / non-goals

Settlement allocation evidence is **not** entitlement proof, invoice creation, payment intent/capture, funds movement, publisher payout, bank/processor settlement, subscription/refund state, tax/VAT calculation, FX conversion, accounting/revenue recognition, authorization, governance or runtime permission.

## Q0–Q9

- Q0 PASS — fresh branch from authoritative main `a7083edbb3bafc9326546fbba10286e696f86a06`.
- Q1 PASS — remaining commercial gap and owner reverse engineering.
- Q2 PASS — settlement owner, exact-linkage model and allocation arithmetic frozen.
- Q3 PASS — canonical owner APIs + settlement implementation.
- Q4 PASS — focused/hardening coverage including both owner-remediation suites.
- Q5 PASS — security/fail-closed review.
- Q6 PASS — architecture/ownership review.
- Q7 PASS — operator-reported green on exact final freeze.
- Q8 PASS — independent final review.
- Q9 READY — requires final frozen-to-closure executable drift zero, PR ready transition, exact-head squash merge and independent `main` verification.
