# Active Phase

**Phase:** MASTER-52 — Machine Commerce Program + Machine Customer Semantics Freeze  
**Status:** RE-IN-PROGRESS  
**Authoritative base main:** `6562d2ee2576fe20c911af41605bffe0c06cdabf`  
**Branch:** `master/52-machine-commerce-semantics-freeze`  
**Previous program:** MASTER-26..51 Application Network — CLOSED

## Goal

Freeze the first post-Application-Network expansion program around Machine Customers / Machine Commerce without introducing a second Application, Capability, principal, pricing, settlement, governance or execution authority.

The key distinction is:

```text
PRE-ENTITLED MACHINE CUSTOMER
agent/service principal
→ entitlement
→ exact Capability consumption
→ usage/rating/pricing/settlement

DYNAMIC MACHINE ACQUISITION
machine principal
→ trusted offer
→ delegated commercial mandate
→ acquisition decision
→ external payment authorization when required
→ entitlement provisioning boundary
→ existing consumption path
```

MASTER-52 is docs/authority only. No payment, funds movement or new runtime execution package is authorized in this phase.

## Q0/Q1 baseline

- exact base main observed: `6562d2ee2576fe20c911af41605bffe0c06cdabf`;
- no open PR observed at phase start;
- package dependency authority: `tooling/package-boundaries.config.mjs`;
- `enterprise-context` already owns `user | agent | service` principal kinds;
- existing commercial owners already cover entitlement, usage/rating, deterministic integer-nanos pricing and publisher/platform allocation;
- hosted query Capability execution already accepts the canonical enterprise principal;
- protected effects remain behind `action-boundary`;
- current federation/supply provider/source IDs are provenance/routing, not authenticated/attested identity;
- current Application Distribution SHA-256 integrity is artifact integrity, not publisher/provider commercial-offer authentication.

## Planned Machine Commerce sequence

```text
MASTER-52  semantics / authority freeze
MASTER-53  pre-entitled Machine Customer proof
MASTER-54  Network Trust Evidence
MASTER-55  exact Commercial Offer contract
MASTER-56  Delegated Commercial Mandate
MASTER-57  Machine Acquisition Decision
MASTER-58  external Payment Authorization Adapter
MASTER-59  dynamic Machine Commerce proof / RC
```

Agentic EDI follows after MASTER-59 and must reuse the Machine Commerce buyer/trust/mandate/commercial authorities rather than creating parallel ones.

## Current deliverables

- `docs/pr-plans/MASTER-52.md`
- `MACHINE_COMMERCE_MODEL.md`
- `MASTER_PLAN.md` alignment
- `PACKAGE_OWNERSHIP.md` future-owner constraints
- this active-phase record

## Completion rule

MASTER-52 may merge only after Q5/Q6 architecture/security review, docs/boundary/repository verification appropriate to the exact head, and an independent Q8 reverse-engineering restart confirms that no current owner was duplicated and no payment/security authority was accidentally granted.
