# MASTER-52 — Machine Commerce Program + Machine Customer Semantics Freeze

**Status:** RE-IN-PROGRESS  
**Base / authoritative main SHA:** `6562d2ee2576fe20c911af41605bffe0c06cdabf`  
**Branch:** `master/52-machine-commerce-semantics-freeze`  
**Previous program:** MASTER-26..51 Application Network — CLOSED

## Goal

Start the first post-Application-Network expansion program by freezing the smallest architecture that allows an AI `agent` or `service` principal to become a real machine customer without turning Vira into a payment processor, generic marketplace, procurement suite, ranking engine or agent framework.

The product target is:

```text
machine principal
      ↓
exact Vira Application / Capability supply
      ↓
trusted commercial offer
      ↓
delegated commercial mandate
      ↓
acquisition decision
      ↓
external payment / commercial adapter when required
      ↓
canonical entitlement
      ↓
Capability consumption
      ↓
usage → rating → pricing → settlement evidence
```

MASTER-52 is a semantic/authority freeze. It introduces no funds movement and no production payment integration.

## Q0 — Baseline

- latest independently observed `main`: `6562d2ee2576fe20c911af41605bffe0c06cdabf`;
- Application Network MASTER-26..51 is closed;
- no open pull request was observed at phase start;
- executable package dependency authority remains `tooling/package-boundaries.config.mjs`;
- repository already has canonical Application, Capability, AI-host, federation, Capability supply, WorkContext, enterprise principal, entitlement, metering, pricing, settlement, governance and Action Boundary owners.

## Q1 — Reverse-engineering findings

### Existing primitives that make Machine Customers unusually adjacent

1. `enterprise-context` already defines `user | agent | service` principals. Machine identity does not require a second principal model.
2. `commercial-entitlement` already supports a principal selector and exact Application/Capability commercial eligibility.
3. `commercial-metering` records the exact principal, Application release, entitlement, meter and optional Capability for usage truth.
4. `commercial-pricing` already produces deterministic integer-nanos quote evidence from canonical usage ratings.
5. `commercial-settlement` already produces deterministic publisher/platform allocation evidence from canonical pricing quote evidence.
6. `capability-contract` distinguishes `query` and protected `action` Capabilities.
7. `hosted-capability-runtime` already executes one-shot trusted-adapter `query` Capabilities for an enterprise principal and scope.
8. `action-boundary` already owns protected `write | irreversible` execution, confirmation, stale revision, idempotency and ActionReceipt semantics.
9. `application-federation` and `capability-supply` already provide exact deterministic discovery without implicit latest or silent fallback.
10. `work-context` can carry bounded `result`, `decision`, `evidence` and `receipt` items without becoming chat history or long-term memory.

### Existing capability that should be proved before inventing more schema

A pre-entitled machine customer is already compositionally possible:

```text
agent/service principal
        ↓
commercial entitlement
        ↓
exact Capability supply
        ↓
hosted query execution
        ↓
usage record
        ↓
rating
        ↓
pricing quote
        ↓
settlement allocation
```

This should become MASTER-53 and must use public package-root APIs only.

### Missing authorities for dynamic machine acquisition

The repository intentionally does **not** currently own:

- authenticated/attested publisher/provider/host network identity;
- signed commercial offer semantics;
- machine purchase/acquisition intent;
- delegated commercial spending mandate;
- deterministic offer acceptance/acquisition evidence;
- payment authorization/provider adapter semantics;
- payment capture, wallet, bank ledger, invoice, tax, FX or payout execution.

The first six are valid post-RC gaps. The latter funds/accounting concerns remain outside Vira core.

### Important trust gap

Current `sourceId`, `publisherId`, `providerId`, `bindingRef` and `locationId` identities are provenance/routing evidence only unless a separate trust mechanism verifies them. Distribution SHA-256 integrity proves artifact bytes only; it does not authenticate the publisher/provider that made a commercial claim.

A machine customer must therefore never spend from an unsigned/unverified commercial offer merely because the related Application or Capability can be discovered.

### Important commercial gap

Current commercial layers can answer:

```text
is this principal entitled?
how much usage occurred?
what does that usage cost under this exact plan?
how is the resulting quote allocated?
```

They do not answer:

```text
what exact commercial offer is this seller making now?
may this machine principal autonomously accept it?
what bounded authority did the human/organization delegate?
which external payment rail, if any, authorized acquisition?
```

Those questions require new owners rather than expanding pricing/settlement into payment or delegation authorities.

## Q2 — Authority freeze

### Machine Customer

A **Machine Customer** is an existing canonical `agent` or `service` enterprise principal acting as the commercial consumer of an exact Vira Application/Capability under explicit commercial eligibility and, for dynamic acquisition, an explicit delegated commercial mandate.

Machine Customer is **not** a new principal kind.

### Machine Commerce

Machine Commerce is the composition layer for machine-readable offers, bounded delegated acquisition and external payment authorization around the existing Application Network commercial/runtime authorities.

Machine Commerce does **not** own:

- Application or Capability identity/version semantics;
- Application federation or Capability supply discovery truth;
- ranking/recommendation of providers;
- entitlement semantics;
- meter/usage/rating truth;
- price-plan/rate-card/quote arithmetic;
- settlement allocation arithmetic;
- governance policy language;
- protected action execution;
- payment credentials, wallet balances, bank ledger, captures, payouts, tax, FX or accounting.

### Planned new semantic owners

No package names are executable authority until their implementation phase completes. Responsibility order is frozen as follows:

1. **Network Trust Evidence** — authenticate/attest the issuer of commercial/network claims; provider-neutral verifier model, no CA/bank/provider empire.
2. **Commercial Offer** — bind an exact seller/provider, exact Application/Capability/binding target, exact commercial plan/settlement references, validity window and trust evidence.
3. **Delegated Commercial Mandate** — bound what an `agent`/`service` may acquire: principals, exact targets/namespaces, currency, maximum amounts, cumulative limits, time, environment/location and human-challenge conditions.
4. **Machine Acquisition Intent + Decision** — machine-requested acquisition and deterministic selected/declined/challenge evidence over explicit candidate offers; no hidden ranking algorithm.
5. **Payment Authorization Adapter** — provider-neutral adapter/evidence that an external payment/commercial rail authorized or declined the exact acquisition; no funds movement in Vira core.

### Exact-reference rule

Existing canonical release/reference parsers remain authoritative. New machine-commerce packages consume them rather than implementing local semver/floating-reference parsers.

### Protected-effect rule

Any acquisition that produces a protected side effect must still cross existing governance and/or the Vira Action Boundary. A commercially valid offer, mandate or payment authorization can never grant runtime/security authority by itself.

## Program order

### MASTER-52 — Machine Commerce Program + Machine Customer Semantics Freeze

Docs/authority only. No new runtime/payment owner.

### MASTER-53 — Pre-entitled Machine Customer Proof

Prove with existing public packages only:

```text
independent AI-host machine principal
→ exact public Application / Capability
→ principal-scoped commercial entitlement
→ exact hosted query execution
→ explicit usage record
→ deterministic rating
→ deterministic pricing quote
→ deterministic settlement allocation
```

No new semantic package unless the proof exposes an unavoidable owner gap.

### MASTER-54 — Network Trust Evidence

Add provider-neutral publisher/provider/host trust evidence and verifier semantics. Keep signatures/PKI/provider implementation behind explicit adapters. Include expiry/revocation/failure-closed behavior.

### MASTER-55 — Exact Commercial Offer Contract

Bind exact seller/provider + exact Application/Capability/binding + plan/settlement + validity + trust evidence. No ranking, auction, negotiation or payment execution.

### MASTER-56 — Delegated Commercial Mandate

Model bounded machine spending/acquisition authority. Must support exact principal binding, currency, amount/cumulative limits, target constraints, temporal bounds and explicit human challenge requirements. Mandate evidence is commercial authority only and cannot bypass governance/Action Boundary.

### MASTER-57 — Machine Acquisition Decision

Add exact acquisition intent, candidate-offer validation and deterministic `selected | declined | challenge-required` evidence. Candidate order is input provenance, not recommendation truth. No implicit best offer.

### MASTER-58 — External Payment Authorization Adapter

Provider-neutral adapter contract for payment/commercial authorization evidence. Candidate adapters may target emerging agentic-payment rails, but Vira does not own payment credentials, capture, wallet/account balances, chargeback, tax, FX or settlement rails.

### MASTER-59 — Dynamic Machine Commerce Proof / RC

An independent AI host must dynamically acquire and consume an independent provider Capability through:

```text
trusted exact offer
→ delegated mandate
→ acquisition decision
→ external payment authorization or explicit no-payment commercial path
→ canonical entitlement provisioning boundary
→ hosted Capability execution
→ usage/rating/pricing/settlement evidence
```

Same machine principal and exact Application/Capability identity must be preserved end to end.

## Next program — Agentic EDI

Agentic EDI is intentionally second. It reuses Machine Commerce trust, mandates, acquisition and commercial evidence instead of inventing a second buyer/payment model.

Planned order after MASTER-59:

- MASTER-60 — Agentic EDI semantics freeze;
- MASTER-61 — trading-party + B2B transaction envelope;
- MASTER-62 — RFQ / quote / award semantics;
- MASTER-63 — purchase-order / fulfillment / invoice reference semantics;
- MASTER-64 — EDI/cXML/Peppol-style protocol adapters without making protocols canonical;
- MASTER-65 — counterparty governance + machine mandate composition;
- MASTER-66 — independent buyer/supplier Agentic EDI proof.

## Explicit non-goals

Machine Commerce must not turn Vira into:

- Visa/Mastercard/Stripe competitor;
- bank or wallet ledger;
- generic shopping marketplace;
- provider ranking/recommendation engine;
- autonomous agent framework;
- procurement suite;
- ERP;
- tax/FX/accounting platform;
- cryptocurrency protocol;
- hidden affiliate/ad auction.

## Security invariants

1. No dynamic machine spend from provenance-only publisher/provider identity.
2. No unsigned/unverified commercial offer acceptance when trust is required.
3. Offer validity and exact target/version fail closed.
4. Mandates are principal-bound, scope-bound, amount-bound and time-bound.
5. Currency mismatch fails closed; no implicit FX.
6. Cumulative limits use safe integer arithmetic; no floating-point money.
7. Commercial authorization never implies security/runtime authorization.
8. Payment authorization evidence never implies successful Capability execution.
9. Capability execution evidence never implies payment/capture success.
10. `action` Capabilities remain behind the Action Boundary.
11. Replay of offer acceptance/payment authorization/acquisition evidence must not create duplicate protected effects.
12. Cross-organization/cross-project mandate or entitlement use fails closed.

## MASTER-52 completion gate

MASTER-52 is complete only when independent review confirms:

- all current nearest owners were identified;
- no new principal type is needed;
- current pre-entitled Machine Customer composition is explicitly separated from dynamic acquisition;
- trust, offer, mandate, acquisition and payment-adapter responsibilities do not overlap existing owners;
- payment/funds/accounting remain outside core;
- Agentic EDI is sequenced after Machine Commerce and reuses its authorities;
- `MASTER_PLAN.md`, `PACKAGE_OWNERSHIP.md` and `ACTIVE_PHASE.md` agree with the freeze;
- Q7 repository checks required for a docs-only ownership phase pass on exact phase head;
- Q8 independently re-reverse-engineers the phase before merge.
