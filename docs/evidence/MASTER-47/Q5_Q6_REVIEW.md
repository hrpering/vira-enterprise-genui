# MASTER-47 — Q5 Security + Q6 Architecture Review

**Date:** 2026-09-05  
**Base:** `a7083edbb3bafc9326546fbba10286e696f86a06`  
**Reviewed executable/test/boundary head:** `25ee1c25223863f3ceeb53210142acd1da331405`  
**Result:** PASS

This is static security/architecture evidence only. Local boundaries/typecheck/focused-suite execution remains Q7; no runtime pass counts or timings are claimed here.

## Q5 — Security / fail-closed review

PASS.

### Untrusted input

- settlement schedules, allocation requests and allocation evidence enter through shared safe JSON parsing;
- exact-object shapes reject unknown fields;
- accessor/custom-prototype cases are covered and must fail without getter execution;
- settlement schedule rules are bounded to `2048`;
- the rule ceiling remains comfortably below the shared JSON node/string budgets for the focused boundary fixture, so the domain limit is reachable rather than shadowed by the shared parser.

### Exact-reference ownership

`application-package` already owns `ViraApplicationExactReference` semantics internally. MASTER-47 exposes owner-local public parse/serialize APIs from the same package rather than copying exact-reference parsing into `commercial-settlement`.

The public API preserves the existing owner semantics:

- canonical semantic namespace id;
- bounded exact versionRef syntax;
- rejection of `latest/current/stable/head/main/next`;
- rejection of x-style floating ranges;
- exact-object/fail-closed parsing;
- canonical frozen output and deterministic serialization.

The existing private Application-package validation path remains inside the same canonical owner package; this is not a second cross-package semantic owner. New focused coverage protects the public owner surface.

### Canonical Application and quote delegation

- allocation requests reparse the supplied Application through `parseViraApplicationPackage`;
- pricing quote input is reparsed through `parseViraCommercialPriceQuote`;
- allocation evidence embeds the canonical quote rather than copying quote fields;
- allocation serialization delegates quote serialization to `commercial-pricing`;
- settlementRef/planRef parsing and serialization delegate to `application-package`.

### Exact linkage

Settlement rules are selected by exact `settlementRef` only.

Rules fail closed unless:

- Application id is namespaced and release version is exact semver;
- publisherId is canonical and matches the Application identity namespace;
- planRef is exact;
- publisher share is an integer `0..10000` basis points.

Evaluation then requires rule Application id/version to equal the canonical Application package and rule planRef to equal the canonical quote planRef. There is no default/latest/fallback settlement policy.

### Monetary arithmetic

Settlement never uses floating-point ratios or direct `gross × basisPoints` multiplication.

For gross safe-integer nanos and integer basis points:

```text
q = floor(gross / 10000)
r = gross % 10000
publisher = q*bps + floor(r*bps/10000)
platform = gross - publisher
```

`q*bps`, `r*bps`, publisher and platform remain within safe-integer bounds for all accepted inputs. Fractional nano remainder deterministically stays with platform. Focused hardening includes `Number.MAX_SAFE_INTEGER` gross and verifies the result against an exact BigInt reference calculation.

### Allocation evidence

The allocation parser independently reparses the canonical quote and recomputes publisher/platform amounts. Forged split arithmetic fails `ALLOCATION_MISMATCH`; forged quote arithmetic fails through the pricing owner.

Allocation evidence parsing validates internal semantics/arithmetic only. It does **not** authenticate who selected the settlement schedule/rule or prove policy provenance. External provenance/trust remains separately owned.

### Authority smuggling

Exact shapes reject invoice/payment/payout/tax/FX/credential/authorization fields. The package contains no processor credential, bank account, payment intent, payout state, subscription/refund state, tax/FX calculation, accounting state, authorization/governance/runtime permission or funds-movement operation.

## Q6 — Architecture / ownership review

PASS.

### New owner justification

MASTER-45 established canonical pricing quote evidence. MASTER-46 closed Capability supply/discovery. The repository constitution explicitly reserves downstream settlement/publisher economics as a separate noun that must consume quote evidence rather than duplicate rate-card arithmetic.

Canonical new owner:

```text
@vira-enterprise-genui/commercial-settlement
```

### Executable dependency boundary

```text
commercial-settlement
  → application-package
  → commercial-pricing
  → protocol
```

No executable dependency on:

- commercial-entitlement or commercial-metering;
- governance/runtime/Action owners;
- Capability runtime/supply;
- telemetry/action-ledger;
- deployment-plane;
- payment processors/banks;
- tax/FX/accounting providers;
- cloud/provider SDKs.

The absence of entitlement dependency is intentional: settlement allocation over a canonical quote does not prove entitlement, charge or payment.

### Owner chain

```text
application-package    → Application release + publisher + exact-reference semantics
commercial-entitlement → commercial eligibility
commercial-metering    → usage/rating truth
commercial-pricing     → rate-card + canonical quote evidence
commercial-settlement  → deterministic publisher/platform allocation evidence
```

No commercial artifact inherits authorization, governance, runtime or protected-effect authority.

### Settlement versus payment/payout

The output is economic allocation evidence only. It does not create an invoice, move funds, authorize a payment, create a publisher payout, settle a bank/processor ledger, determine taxes, convert FX or recognize revenue.

Generic payment-provider integration remains outside Vira core semantics.

### Determinism / no policy fallback

- exact settlementRef selection only;
- duplicate refs fail closed;
- no implicit latest/default policy;
- exact Application release/publisher namespace/plan binding;
- deterministic basis-point rounding;
- canonical quote embedded and independently reparsed.

## Focused verification surface

```text
tests/contract/application-exact-reference.test.ts
tests/contract/commercial-settlement.test.ts
tests/contract/commercial-settlement-hardening.test.ts
```

Coverage includes exact-reference roundtrip/floating rejection, schedule sorting/freeze/serialization, exact Application/plan linkage, no fallback, 0/100% and fractional rounding, MAX_SAFE arithmetic, forged allocation/quote evidence, impossible publisher parity, authority/payment/tax/credential smuggling, collection bounds and accessor/custom-prototype fail-closed behavior.

## Conclusion

Q5 PASS / Q6 PASS on executable/test/boundary head `25ee1c25223863f3ceeb53210142acd1da331405`.

This SHA is the executable freeze candidate. Any later source/package/test/boundary change invalidates this review and requires a new review before Q7.
