# MASTER-47 — Q5 Security + Q6 Architecture Review

**Date:** 2026-09-05  
**Base:** `a7083edbb3bafc9326546fbba10286e696f86a06`  
**Reviewed executable/test/boundary head:** `b42ae481700094f118328f111f8011ab44136877`  
**Result:** PASS after Q8 remediation

This is static security/architecture evidence only. It does not reconstruct local runtime counts/timings.

## Q5 — Security / fail-closed review

PASS.

### Untrusted input

- settlement schedules, allocation requests and allocation evidence enter through shared safe JSON parsing;
- exact-object shapes reject unknown fields;
- accessor/custom-prototype cases cover direct exact-reference parsing, schedules, requests and persisted allocation evidence and fail without getter execution;
- settlement schedule rules are bounded to `2048`;
- focused evidence-smuggling coverage rejects invoice/payment/payout/tax/FX/credential/authorization fields across schedule/request/allocation surfaces.

### Exact-reference ownership — remediated

`application-package` is the sole exact-reference semantic owner.

The canonical implementation is now:

```text
parseViraApplicationExactReference
serializeViraApplicationExactReference
```

`parseViraApplicationPackage` no longer maintains its own `VERSION_REF`, floating-alias/range or exact-reference parser implementation. Its internal nested-reference wrapper delegates to the canonical parser and only remaps `$`-relative error paths back to the package field path.

Focused parity coverage checks direct public parsing and package reference validation remain aligned while preserving contextual package error paths.

### Canonical Application and quote delegation

- allocation requests reparse Application input through `parseViraApplicationPackage`;
- pricing quote input is reparsed through `parseViraCommercialPriceQuote`;
- allocation evidence embeds the canonical quote rather than copying quote fields;
- allocation serialization delegates quote serialization to `commercial-pricing`;
- settlementRef/planRef parse/serialize delegates to the Application exact-reference owner.

### Exact linkage

Settlement rules are selected by exact `settlementRef` only.

Rules fail closed unless:

- Application id is namespaced and release version exact semver;
- publisherId matches the Application identity namespace;
- planRef is exact/non-floating;
- publisher share is integer `0..10000` basis points.

Evaluation requires exact Application id/version match and exact rule-plan/quote-plan match. There is no default/latest/fallback settlement policy.

### Monetary arithmetic

Settlement never uses floating-point ratios or unsafe direct `gross × basisPoints` multiplication.

```text
q = floor(gross / 10000)
r = gross % 10000
publisher = q*bps + floor(r*bps/10000)
platform = gross - publisher
```

All accepted operations remain safe-integer bounded, including `Number.MAX_SAFE_INTEGER` gross. Fractional nano remainder deterministically stays with platform. Focused hardening compares the MAX_SAFE case with an exact BigInt reference calculation.

### Allocation evidence

The allocation parser reparses the embedded canonical quote and recomputes publisher/platform amounts. Forged split arithmetic fails `ALLOCATION_MISMATCH`; forged quote arithmetic fails through the pricing owner.

Evidence parsing validates internal semantics/arithmetic only. It does not authenticate settlement-policy provenance, prove entitlement, move funds or create payout state.

## Q6 — Architecture / ownership review

PASS.

### Canonical owner chain

```text
application-package    → Application release + publisher + exact-reference semantics
commercial-entitlement → commercial eligibility
commercial-metering    → usage/rating truth
commercial-pricing     → rate-card + canonical quote evidence
commercial-settlement  → deterministic publisher/platform allocation evidence
```

The Q8 remediation strengthens this chain by making Application exact-reference semantics one implementation inside the canonical owner rather than two parallel owner-local parsers.

### Executable dependency boundary

```text
commercial-settlement
  → application-package
  → commercial-pricing
  → protocol
```

No executable dependency on commercial-entitlement/metering, governance/runtime/Action owners, Capability runtime/supply, telemetry/action-ledger, deployment, payment processors/banks, tax/FX/accounting providers or cloud SDKs.

The absence of entitlement dependency is intentional: allocation over canonical quote evidence does not prove entitlement, charge or payment.

### Settlement versus payment/payout

The output is economic allocation evidence only. It does not create an invoice, move funds, authorize a payment, create a publisher payout, settle a processor/bank ledger, determine taxes, convert FX or recognize revenue.

Generic payment-provider integration remains outside Vira core semantics.

### Determinism / no policy fallback

- exact settlementRef selection only;
- duplicate refs fail closed;
- no implicit latest/default policy;
- exact Application release/publisher namespace/plan binding;
- deterministic integer basis-point rounding;
- canonical quote embedded and independently reparsed.

## Focused verification surface

```text
tests/contract/application-exact-reference.test.ts
tests/contract/commercial-settlement.test.ts
tests/contract/commercial-settlement-hardening.test.ts
```

Coverage now includes exact-reference parser/package parity, nested package error-path preservation, exact-reference roundtrip/floating rejection, schedule determinism, exact Application/plan linkage, no fallback, 0/100% and fractional rounding, MAX_SAFE arithmetic, canonical quote roundtrip, forged allocation/quote evidence, impossible publisher parity, authority/payment/tax/credential smuggling on persisted evidence, collection bounds and accessor/custom-prototype fail-closed behavior.

## Conclusion

Q5 PASS / Q6 PASS on remediated executable/test/boundary head:

`b42ae481700094f118328f111f8011ab44136877`

This is the new executable freeze candidate. The previous Q7 PASS on `25ee1c25223863f3ceeb53210142acd1da331405` is invalidated for final merge because executable/tests changed afterward. A fresh exact-head local Q7 is required before Q8 restarts.
