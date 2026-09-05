# MASTER-47 — Commercial Settlement Allocation + Publisher Economics

## Goal

Add the final provider-neutral commercial-network primitive: deterministic allocation of canonical pricing quote evidence into publisher/platform economic evidence, without becoming invoice, payment, payout, subscription, tax, FX, accounting or runtime/security authority.

## Base

- authoritative `main`: `a7083edbb3bafc9326546fbba10286e696f86a06`
- previous phase: MASTER-46 merged via PR #207
- branch: `master/47-commercial-settlement`
- draft PR: #208
- current frozen executable/test/boundary SHA: `95c9a0674742c702cc5265b8e1fb35f82dea04ad`
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

## Exact-reference owner boundary

`application-package` exposes canonical:

```text
parseViraApplicationExactReference
serializeViraApplicationExactReference
```

Q8 attempt 1 found that the package still retained a second private exact-reference parser implementation. Remediation made the public owner API the single implementation and changed `parseViraApplicationPackage` to delegate nested exact references while preserving contextual error paths.

Evidence: `docs/evidence/MASTER-47/Q8_ATTEMPT_1.md`.

## Application release owner boundary

Restarted Q8 then found a second canonical-owner duplication: settlement schedule and allocation-evidence parsing independently validated `applicationId + applicationVersion` with local namespaced-id/RELEASE_VERSION logic, while Application release identity/version belongs to `application-package`.

Remediation adds canonical owner-local:

```text
parseViraApplicationReleaseReference
serializeViraApplicationReleaseReference
```

The owner API validates exact namespaced Application id + exact release semver and owns canonical freeze/serialization.

`parseViraApplicationPackage` now delegates root Application id/version validation to this API. `commercial-settlement` schedule and allocation-evidence parsing delegate to the same API; their local Application-release regex/validation implementation was removed.

Focused `application-release-reference.test.ts` protects direct-owner ↔ package-parser ↔ settlement-parser acceptance parity, nested package paths, deterministic serialization and unsafe-object rejection.

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

A request contains canonical Application package, exact settlementRef and canonical pricing quote. Evaluation reparses each canonical artifact through its owner, requires exact rule lookup, exact Application release match and exact quote planRef match.

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

Embedding the canonical quote avoids copying pricing semantics. Allocation parse/serialize delegates quote semantics to `commercial-pricing`, exact-ref semantics to the Application exact-reference owner and Application id/version semantics to the Application release-reference owner. The allocation parser independently verifies publisher namespace parity, canonical quote validity and exact split arithmetic.

Parsing allocation evidence validates internal semantics/arithmetic only. It does not authenticate who selected the settlement schedule/rule or prove external policy provenance.

## Q3 implementation

PASS.

Added:

- Application exact-reference owner-local public API;
- Application release-reference owner-local public API;
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
tests/contract/application-release-reference.test.ts
tests/contract/commercial-settlement.test.ts
tests/contract/commercial-settlement-hardening.test.ts
```

Coverage includes exact-reference owner/package parity; Application-release direct/package/settlement parity; nested path preservation; schedule determinism; exact Application/plan linkage; publisher namespace parity; no fallback; 0/100% shares; fractional rounding; MAX_SAFE gross verified against BigInt; canonical embedded quote roundtrip; forged allocation/quote rejection; payment/payout/tax/FX/credential/authority smuggling including persisted allocation evidence; rule ceiling; and accessor/custom-prototype fail-closed behavior.

## Q5/Q6

PASS on current remediated executable/test/boundary head:

`95c9a0674742c702cc5265b8e1fb35f82dea04ad`

Evidence: `docs/evidence/MASTER-47/Q5_Q6_REVIEW.md`.

## Q7 history

Attempt 1 PASS on `25ee1c25223863f3ceeb53210142acd1da331405`; invalidated by Q8 exact-reference owner finding.

Attempt 2 PASS on `b42ae481700094f118328f111f8011ab44136877`; invalidated by restarted Q8 Application-release owner finding.

Both operator-reported greens remain historical evidence only. No counts/timings are reconstructed.

## Q8 history

- Attempt 1 FAIL — duplicate exact-reference parser implementations. Evidence: `docs/evidence/MASTER-47/Q8_ATTEMPT_1.md`.
- Attempt 2 FAIL — duplicated Application release id/version semantics in settlement. Evidence: `docs/evidence/MASTER-47/Q8_ATTEMPT_2.md`.

Both findings are remediated in current freeze `95c9a0674742c702cc5265b8e1fb35f82dea04ad`.

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

## Current gate

Run full local gate only against exact current freeze:

```bash
pnpm check:boundaries
pnpm typecheck
pnpm vitest run \
  tests/contract/application-exact-reference.test.ts \
  tests/contract/application-release-reference.test.ts \
  tests/contract/commercial-settlement.test.ts \
  tests/contract/commercial-settlement-hardening.test.ts
```

## Q0–Q9

- Q0 PASS — fresh branch from exact authoritative main `a7083edbb3bafc9326546fbba10286e696f86a06`.
- Q1 PASS — remaining commercial gap and owner reverse engineering.
- Q2 PASS — settlement owner, exact-linkage model and allocation arithmetic frozen.
- Q3 PASS — canonical owner APIs + settlement implementation.
- Q4 PASS — focused/hardening coverage, including both owner-remediation suites.
- Q5 PASS — security/fail-closed re-review on current freeze.
- Q6 PASS — architecture/ownership re-review on current freeze.
- Q7 RERUN PENDING — exact current frozen-head local gate required.
- Q8 BLOCKED — restart only after new Q7 PASS.
- Q9 BLOCKED until Q8 PASS and final closure compare.
