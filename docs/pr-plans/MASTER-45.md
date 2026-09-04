# MASTER-45 — Commercial Pricing + Rate Card

## Goal

Introduce the canonical provider-neutral monetary pricing boundary downstream of commercial entitlement/metering without creating invoice/payment/subscription/payout authority or mutating usage truth.

## Base

- authoritative `main`: `f1ee6ec68b9c1a53f3413b9f201eae355517fc52`
- previous phase: MASTER-44 merged via PR #205
- branch: `master/45-commercial-pricing`
- draft PR: #206
- final frozen executable SHA: `0984b0145381f8344dc458cd28d3e1b26db79e78`
- invalidated previous freeze: `5876a177a5c14dfa4ae90d1b1e2a618c01d30eb2`

## Q1 reverse engineering

`commercial-entitlement` owns exact commercial eligibility and returns an exact opaque `planRef`; it deliberately does not own monetary price semantics. `commercial-metering` owns exact meter definitions and non-monetary ratings (`used / limit / remaining / excess`). `application-package` carries exact commercial references but no price schema. Legacy `experience-marketplace` remains Experience catalog/search and is not Application Network economics authority.

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

Pricing consumes an explicitly selected exact `planRef`; producing or parsing a quote does not prove entitlement to that plan.

## Pricing model

A price catalog contains exact plans with exact `planRef`, lexical uppercase three-letter `currency`, non-negative safe-integer `fixedAmountNanos`, and bounded per-meter rates. One currency unit equals `1_000_000_000` pricing nanos. Monetary arithmetic is integer-only. Currency validation is lexical only; core does not claim ISO membership, FX or legal-tender authority.

Each meter rate contains exact `meteringRef`, basis `used | excess`, and non-negative safe-integer `amountNanosPerUnit`.

## Canonical rating evidence

`commercial-metering` owns `parseViraCommercialUsageRating` and `serializeViraCommercialUsageRating`.

The parser validates exact metering reference, canonical unit/window/status, canonical UTC `asOf` and window bounds, safe-integer quantities, included-record ceiling, zero/nonzero count/usage consistency, `usedQuantity >= includedRecordCount`, and used/limit/remaining/excess/status consistency.

Evidence parsing does not authenticate source or prove integrity/attestation.

## Quote request / quote evidence

A pricing request contains exact `planRef`, canonical UTC `asOf`, and canonical metering ratings. Every plan rate requires exactly one matching rating. Extra, duplicate, missing or time-mismatched ratings fail closed.

The deterministic quote contains exact plan ref, currency, as-of, fixed nanos, deterministic line items and total nanos. Multiplication overflow is guarded before multiplication; total overflow before addition.

`commercial-pricing` owns `parseViraCommercialPriceQuote` and `serializeViraCommercialPriceQuote`. The parser independently validates exact shape, references, canonical time, line arithmetic, duplicate line identities and total arithmetic. A parsed quote is internally consistent pricing evidence only; it does not prove entitlement or authentic origin and is not invoice/payment/subscription/settlement authority.

## Q3 implementation

PASS. Added canonical metering rating evidence parser/serializer, `commercial-pricing`, deterministic catalog serialization, used/excess/fixed pricing, quote evidence parser/serializer and executable dependency boundary.

## Q4 focused/hardening coverage

Focused suites:

```text
tests/contract/commercial-metering-rating-evidence.test.ts
tests/contract/commercial-pricing.test.ts
tests/contract/commercial-pricing-hardening.test.ts
```

Coverage includes rating roundtrip/canonical UTC/window/status semantics, producer consistency, floating refs, accessor/custom-prototype rejection, deterministic plan/rate ordering, fixed/used/excess pricing, quote roundtrip, missing/extra/duplicate ratings, time mismatch, invalid currency/money, pre-multiplication/total overflow, forged quote arithmetic, duplicate quote lines, authority/payment/tax/credential smuggling and collection ceilings.

## Q5 security review

PASS. Evidence: `docs/evidence/MASTER-45/Q5_Q6_REVIEW.md`.

## Q6 architecture/ownership review

PASS. Dependency authority remains:

```text
commercial-pricing → application-package, commercial-metering, protocol
```

Canonical owner chain remains entitlement → metering → pricing; future invoice/payment/subscription/settlement layers stay downstream and separate. No commercial layer inherits security/runtime authority.

## Q7 attempt 1

Operator-reported PASS on `5876a177a5c14dfa4ae90d1b1e2a618c01d30eb2`; later invalidated by Q8 executable finding. Evidence: `docs/evidence/MASTER-45/Q7_LOCAL_PASS.md`.

## Q8 attempt 1

FAIL. Evidence: `docs/evidence/MASTER-45/Q8_ATTEMPT_1.md`.

Independent review found `usedQuantity < includedRecordCount` could be accepted even though canonical usage records require every included quantity to be positive. The canonical metering parser and focused test were hardened.

## Final Q7 rerun

PASS on exact final frozen executable SHA:

```text
0984b0145381f8344dc458cd28d3e1b26db79e78
```

Operator reran boundaries, typecheck and all three focused suites detached at that SHA and reported green. Evidence: `docs/evidence/MASTER-45/Q7_RERUN_PASS.md`. No counts/timings are reconstructed.

## Final Q8 independent review

PASS. Evidence: `docs/evidence/MASTER-45/Q8_REVIEW.md`.

Reviewed PR head: `32ae25c2cbcf9bb6708d0449759db157a932a03f`.

Results: owner boundaries preserved; exact refs/no implicit latest; rating producer invariants fail closed; pricing arithmetic fails before precision loss; quote evidence revalidates line/total arithmetic; no entitlement/security/runtime authority acquisition; no invoice/payment/subscription/settlement/payout semantics; no dependency creep; no submitted reviews, review threads or comments; hosted jobs expose `steps=null` and remain infrastructure non-signal; frozen executable → reviewed head contains docs/evidence only.

## Final closure rule

After Q8, only documentation/evidence changes are permitted. The authoritative final closure check is the connector compare from frozen executable `0984b0145381f8344dc458cd28d3e1b26db79e78` to the current PR head immediately before merge. The exact merge head is enforced with `expected_head_sha`; it is intentionally not embedded here because changing this document itself advances the branch head.

## Non-goals

MASTER-45 does not implement payment providers, invoices, taxes, FX, refunds, subscription lifecycle, publisher settlement, revenue share, provider payouts, marketplace ranking, provider discovery or generic billing infrastructure.

## Q0–Q9

- Q0 PASS
- Q1 PASS
- Q2 PASS
- Q3 PASS
- Q4 PASS
- Q5 PASS
- Q6 PASS
- Q7 PASS — final exact frozen-head rerun
- Q8 PASS — independent PR reverse engineering after remediation
- Q9 READY — exact-head squash merge subject to final connector closure compare
