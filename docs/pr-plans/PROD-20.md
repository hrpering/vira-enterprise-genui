# PROD-20 — Machine Commerce and Dynamic Acquisition

**Status:** DEFERRED / NOT ACTIVE  
**Dependencies:** PROD-14 + PROD-19  
**Source reconciliation:** draft PR #214 (`MASTER-52..59`) is folded into this single production phase.

## Purpose

Preserve the Machine Commerce design work without allowing it to compete with the Production MVP roadmap or bypass the canonical commercial/security owners.

## Existing owners that must be reused

- machine principal: `enterprise-context` (`agent | service`);
- Application identity/discovery: `application-package`, `application-federation`;
- Capability identity/discovery/execution: `capability-contract`, `capability-supply`, `hosted-capability-runtime`;
- protected effects: `action-boundary`;
- governance: `governance`, `enterprise-governance`;
- bounded work evidence: `work-context`;
- entitlement: `commercial-entitlement`;
- usage/rating: `commercial-metering`;
- pricing: `commercial-pricing`;
- settlement allocation: `commercial-settlement`.

## Deferred responsibilities

### Network Trust Evidence

Bind issuer identity, subject/ref, issued/expiry, verifier/provider and opaque attestation/signature evidence to an explicit `verified | rejected` result with revocation/expiry failure semantics. It does not own PKI, certificate issuance, wallets or global trust ranking.

### Exact Commercial Offer

Bind exact offer identity/version, seller/publisher/provider identity, exact Application release and optional Capability release, optional exact hosted binding/location, exact plan/settlement refs, validity window, canonical currency evidence and trust evidence. Offer is not entitlement, authorization, payment or execution permission.

### Delegated Commercial Mandate

Bound one existing `agent | service` principal by scope, exact Application/Capability namespaces or refs, allowed sellers/providers/currencies, per-acquisition and cumulative limits, bounded window, location/environment, validity and human challenge conditions. A mandate never bypasses governance, Action Boundary, payment authorization or entitlement.

### Machine Acquisition Intent + Decision

Deterministic result surface only:

```text
selected
declined
challenge-required
```

Selection binds exact offer, principal, mandate and pricing evidence. Core does not own ranking, recommendation or auction semantics.

### External Payment Authorization Adapter

Evidence may state `authorized | declined | challenge-required` and bind exact acquisition/amount/currency/adapter/provider evidence. Vira core does not capture/move funds or own wallet/bank/invoice/tax/FX/accounting truth.

### Entitlement provisioning boundary

Successful acquisition/payment authorization may feed an explicit trusted control-plane integration that provisions canonical entitlement. Consumption then follows the normal entitlement, governance and execution paths.

## Required RC proof

`verify:machine-commerce-rc` must fail closed for expired/revoked offer, mandate overflow, currency mismatch, replay, cross-organization scope and protected-action bypass.

The final proof must preserve the same exact machine/Application/Capability/commercial identities through acquisition → entitlement → execution → usage/rating/pricing/settlement evidence.

No PROD-20 implementation begins before both dependencies close at Q9.
