# Vira Machine Commerce Model

## Thesis

Vira Machine Commerce extends the closed Application Network so an existing canonical `agent` or `service` principal can become a commercial consumer of exact Vira Applications and Capabilities.

The model has two stages.

### Stage A — Pre-entitled machine consumption

Already compositionally supported by current canonical owners:

```text
agent/service principal
        ↓
commercial entitlement
        ↓
exact Application / Capability discovery
        ↓
hosted query execution
        ↓
explicit commercial usage
        ↓
rating
        ↓
pricing quote
        ↓
settlement allocation
```

No new machine identity, meter, pricing or settlement schema is needed to prove this path.

### Stage B — Dynamic machine acquisition

New post-RC authority is required only for the acquisition boundary:

```text
machine principal
        ↓
exact trusted offer
        ↓
delegated commercial mandate
        ↓
acquisition intent
        ↓
selected / declined / challenge-required decision
        ↓
external payment authorization if required
        ↓
entitlement provisioning boundary
        ↓
existing Stage-A consumption path
```

## Canonical owner reuse

Machine Commerce must consume, not redefine:

| Concern | Existing owner |
|---|---|
| machine principal | `enterprise-context` (`agent | service`) |
| Application identity/release refs | `application-package` |
| Application discovery | `application-federation` |
| Capability identity/release refs | `capability-contract` |
| Capability discovery/binding | `capability-supply` |
| hosted query execution | `hosted-capability-runtime` |
| protected actions | `action-boundary` |
| governance / approval | `governance` / `enterprise-governance` |
| bounded work evidence | `work-context` |
| commercial eligibility | `commercial-entitlement` |
| usage/rating | `commercial-metering` |
| price-plan/rate arithmetic | `commercial-pricing` |
| publisher/platform allocation | `commercial-settlement` |

## New responsibilities

### 1. Network Trust Evidence

Purpose: answer whether a commercial/network claim is attributable to an expected publisher/provider/host under an explicit verifier.

Must support at minimum:

- issuer identity reference;
- subject identity/reference;
- issued/expiry time;
- verifier/provider reference;
- opaque attestation/signature evidence;
- explicit `verified | rejected` result;
- revocation/expiry failure semantics.

It does not own PKI, certificate issuance, wallets, provider accounts or a global trust ranking.

### 2. Commercial Offer

Purpose: represent one seller/provider's exact machine-readable offer.

An offer binds:

- exact offer identity/version;
- exact seller/publisher/provider identity;
- exact Application release and optional Capability release;
- optional exact hosted binding/location;
- exact `planRef`;
- exact `settlementRef` when applicable;
- validity window;
- currency declaration inherited/validated against canonical pricing evidence;
- trust evidence/reference.

Offer is not pricing arithmetic, entitlement, authorization, payment or execution permission.

### 3. Delegated Commercial Mandate

Purpose: express bounded commercial authority granted to one existing `agent` or `service` principal.

A mandate may constrain:

- principal;
- organization/project/environment;
- exact Application/Capability namespaces or refs;
- allowed seller/provider identities;
- allowed currencies;
- per-acquisition maximum;
- cumulative maximum + explicit bounded window;
- location/environment;
- valid-from/expiry;
- human challenge threshold/condition references.

A mandate is commercial authority evidence only. It does not bypass governance, Action Boundary, payment authorization or entitlement.

### 4. Machine Acquisition Intent + Decision

Purpose: represent what the machine wants to acquire and the deterministic decision over explicit candidate offers.

The decision surface may emit only:

```text
selected
declined
challenge-required
```

Core does not rank, recommend, auction or infer a winner. Candidate ordering is input provenance only.

Selection must bind the exact offer, exact machine principal, exact mandate and exact pricing evidence used.

### 5. External Payment Authorization Adapter

Purpose: bridge the selected acquisition to a payment/commercial rail without moving funds in Vira core.

Adapter evidence may state:

```text
authorized
declined
challenge-required
```

and bind the exact acquisition/amount/currency/adapter/provider evidence.

It must not expose raw payment credentials to Application artifacts or runtime state.

It does not own capture, wallet/account balances, bank ledger, invoice, payout, tax, FX, chargebacks or accounting.

## Trust model

Current Application Distribution SHA-256 integrity answers:

> Are these canonical artifact bytes the bytes expected by this integrity declaration/verifier?

It does not by itself answer:

> Did the claimed publisher/provider authorize this commercial offer?

Likewise current federation/supply source and provider IDs are provenance/routing data unless a separate trust provider verifies them.

Therefore dynamic acquisition requires explicit trust verification before mandate evaluation or payment authorization.

## Money model

All monetary amounts remain safe integers.

Canonical pricing remains integer currency nanos. Machine Commerce may constrain or compare already-canonical monetary evidence but may not introduce floating-point money or implicit FX.

Currency conversion is outside core unless a future separately owned FX authority is explicitly introduced. Currency mismatch otherwise fails closed.

## Execution model

A successful machine acquisition does not directly execute an Application Action or Capability.

After acquisition/payment authorization, a trusted commercial control-plane integration may provision/update canonical entitlement state. Runtime consumption then follows existing entitlement, governance and execution authorities.

For protected side effects:

```text
commercially valid
      ≠
governance allowed
      ≠
action execution permitted
```

All three remain independent gates.

## Replay / idempotency

Machine Commerce must carry stable identities for intent, selected acquisition and external authorization evidence so adapters can reject replay/duplicate protected effects.

No acquisition evidence alone may be treated as proof that payment captured or Capability/Action executed.

## Relationship to Agentic EDI

Agentic EDI is downstream.

It will reuse:

- machine principals;
- trust evidence;
- commercial offers;
- delegated mandates;
- acquisition evidence;
- payment adapter evidence;
- canonical entitlement/pricing/settlement;
- governance and Action Boundary.

Agentic EDI adds trading-party and transaction-document lifecycle semantics such as RFQ, quote, award, purchase-order, fulfillment and invoice references. It must not invent a second machine-buyer, money or trust model.

## Relationship to Missions / multi-Application composition

Machine Commerce does not own task planning or multi-Application orchestration. A future Mission system may consume Machine Commerce when a composed task needs to acquire a Capability/Application, but Mission semantics must remain separate from commercial acquisition semantics.

## Program gate

Machine Commerce is successful only when an independent AI host can, using public Vira package surfaces:

1. act as one exact `agent`/`service` principal;
2. discover exact Application/Capability supply;
3. verify an exact commercial offer issuer;
4. prove a bounded delegated mandate;
5. produce deterministic acquisition evidence;
6. obtain explicit external payment authorization when required;
7. reach canonical entitlement through an explicit provisioning boundary;
8. execute the exact Capability;
9. emit usage/rating/pricing/settlement evidence preserving the same exact identities;
10. fail closed for expired/revoked offer, mandate overflow, currency mismatch, replay, cross-org scope and protected-action bypass.
