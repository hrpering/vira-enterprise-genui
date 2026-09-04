# MASTER-45 — Q5 Security + Q6 Architecture Review

**Date:** 2026-09-05  
**Base:** `f1ee6ec68b9c1a53f3413b9f201eae355517fc52`  
**Frozen executable SHA:** `5876a177a5c14dfa4ae90d1b1e2a618c01d30eb2`  
**Verdict:** Q5 PASS / Q6 PASS

## Reviewed executable surface

- `packages/commercial-metering/src/rating-evidence.ts`
- `packages/commercial-metering/src/index.ts`
- `packages/commercial-pricing/package.json`
- `packages/commercial-pricing/src/types.ts`
- `packages/commercial-pricing/src/pricing.ts`
- `packages/commercial-pricing/src/quote-evidence.ts`
- `packages/commercial-pricing/src/index.ts`
- `tests/contract/commercial-metering-rating-evidence.test.ts`
- `tests/contract/commercial-pricing.test.ts`
- `tests/contract/commercial-pricing-hardening.test.ts`
- `tooling/package-boundaries.config.mjs`

## Q5 security / fail-closed review

PASS.

### Untrusted input

Catalogs, pricing requests, rating evidence and quote evidence enter through the shared safe JSON parser before semantic inspection. Exact object shapes reject extra authority/payment/credential fields.

Exact references reject floating aliases/ranges; no implicit latest/fallback is introduced.

### Rating evidence integrity

`commercial-metering` remains the canonical rating owner. The new parser validates the existing rating shape rather than redefining it in pricing.

The parser verifies:

- exact metering reference;
- canonical meter unit/window/status values;
- canonical UTC `asOf` and exact UTC window boundaries;
- non-negative safe-integer quantities;
- `includedRecordCount <= VIRA_COMMERCIAL_METERING_MAX_USAGE_RECORDS`;
- zero/nonzero consistency between included-record count and used quantity, reflecting positive canonical usage-record quantities;
- status/remaining/excess consistency with used/limit quantities.

This prevents pricing from accepting structurally plausible but impossible rating evidence that the canonical metering producer could not emit.

Rating parsing is validation, not source authentication or integrity attestation. Trust/provenance of persisted/transmitted evidence remains an integration concern.

### Money arithmetic

Core monetary values are non-negative safe-integer currency nanos only. No floating-point monetary arithmetic is used.

Line multiplication checks the safe-integer bound **before multiplication** using `MAX_SAFE_INTEGER / quantity`. Total accumulation checks available safe-integer headroom before addition.

Both quote generation and quote evidence parsing fail closed on arithmetic overflow.

### Quote evidence integrity

The pricing owner validates its own downstream evidence shape. Quote parsing verifies:

- exact plan/meter references;
- currency syntax;
- canonical `asOf`;
- bounded line count;
- non-negative safe-integer quantity/rate/amount values;
- each line amount equals `quantity × amountNanosPerUnit`;
- duplicate meter lines fail;
- total equals fixed amount plus all line amounts;
- overflow fails before precision loss.

This prevents the next commercial phase from needing to duplicate pricing quote semantics.

### Authority separation

A pricing quote is monetary evidence only. It contains no invoice/payment/subscription/settlement/tax/governance/runtime authorization state.

Parsing or producing a quote does not:

- grant entitlement;
- authorize execution;
- charge a payment method;
- create an invoice;
- mutate usage;
- mutate entitlement;
- establish subscription state;
- settle/payout a publisher/provider.

Currency validation is lexical (`^[A-Z]{3}$`) only; core does not claim ISO membership, FX or legal-tender authority.

## Q6 architecture / ownership review

PASS.

### Canonical ownership

- `commercial-entitlement` retains exact commercial eligibility + `planRef` selection.
- `commercial-metering` retains meter definitions, usage truth and non-monetary ratings.
- `commercial-pricing` owns only rate-card/plan monetary semantics and deterministic quote evidence.
- payment/invoice/subscription/settlement/payout semantics remain unowned by this phase and explicitly downstream.

The existing `experience-marketplace` remains Experience catalog/search and is not extended into Application Network economics.

### Dependency authority

Executable boundary:

```text
commercial-pricing → application-package, commercial-metering, protocol
```

No dependency on governance, runtime, Action Boundary, telemetry, action-ledger, hosted-capability-runtime, payment providers, deployment, marketplace search, cloud/provider SDKs or commercial-entitlement.

The absence of a direct `commercial-entitlement` dependency is intentional: the quote evaluator consumes an explicitly selected exact `planRef`; a quote does not prove the caller is entitled to that plan. Entitlement remains an independent upstream commercial decision.

### Downstream interoperability

MASTER-45 adds canonical parser/serializer surfaces to the owners that produce downstream evidence:

- `commercial-metering` parses/serializes `ViraCommercialUsageRating`;
- `commercial-pricing` parses/serializes `ViraCommercialPriceQuote`.

This preserves one-owner-per-noun across future invoice/settlement phases and avoids shape copying.

## Static coverage review

Focused tests cover:

- rating roundtrip/canonical UTC/window/status semantics;
- impossible rating record-count/usage combinations;
- floating refs and invalid quantities;
- safe accessor/custom-prototype rejection;
- deterministic catalog parsing/serialization;
- fixed + used pricing;
- excess pricing;
- fixed-only pricing;
- deterministic plan/rate ordering;
- quote evidence roundtrip;
- duplicate plans/rates/ratings;
- missing/extra ratings;
- rating time mismatch;
- canonical rating parser delegation;
- invalid currency/negative/fractional/unsafe money;
- pre-multiplication and accumulation overflow;
- forged quote line/total arithmetic;
- duplicate quote lines;
- payment/tax/authority/credential smuggling;
- collection bounds.

Exact local execution remains Q7; this document does not claim local test results.

## Freeze rule

Executable freeze:

```text
5876a177a5c14dfa4ae90d1b1e2a618c01d30eb2
```

Any executable/package/test/boundary change after this SHA invalidates this review and requires a new executable freeze plus local Q7.
