# Production Owner Matrix — PROD-00 Freeze

This file records the production-program ownership map. `PACKAGE_OWNERSHIP.md` remains the explanation of existing owners; `tooling/package-boundaries.config.mjs` remains executable dependency authority until a future phase intentionally changes it.

## Existing owners to extend/reuse

| Concern | Owner |
|---|---|
| Application identity/package | `application-package` |
| Application graph | `application-graph` |
| Distribution | `application-distribution` |
| Federation/discovery | `application-federation` |
| Publication/deployment | `deployment-plane` |
| Studio document/publish | `studio-schema`, `studio-publish` |
| Runtime state | `runtime-core` |
| Capability semantics/supply | `capability-contract`, `capability-supply` |
| Hosted query execution | `hosted-capability-runtime` |
| Protected effects | `action-boundary` |
| Audit/effect ledger | `action-ledger` |
| Work state | `work-context` |
| Governance | `governance`, `enterprise-governance` |
| Enterprise scope | `enterprise-context` |
| Commercial chain | existing entitlement/metering/pricing/settlement owners |

## Production-program owners added by PROD-00..22

| Concern | Implemented owner | Owning phase |
|---|---|---:|
| exact Application resolution | `application-resolution` | PROD-05 |
| durable Application coordination | `application-runtime` | PROD-08 |
| provider connection lifecycle | `provider-connection` | PROD-07 |
| provider trust | `provider-trust` | PROD-09 |
| exact Action binding discovery | `action-supply` | PROD-10 |
| transaction meaning | `action-transaction` | PROD-10 |
| one-time execution grant | `action-transaction` | PROD-11 |
| durable protected execution | `durable-execution` | PROD-12 |
| private provider execution | `private-runner` | PROD-12 |
| postcondition semantics | `action-verification` | PROD-13 |
| artifact identity/lineage | `artifact-contract` | PROD-08 |
| durable persistence adapters | `integrations/postgres` | PROD-02 onward |
| artifact bytes port | `artifact-contract`; external object-store integration remains live-environment work | PROD-08 |

These owners are present in the provisional repository implementation and remain constrained by their phase evidence, public package boundaries and executable dependency rules. Their presence does not prove a live provider, object store, payment system, deployment or release authority.

## External/live ownership still open

Operational accounts and immutable evidence for Vercel, Railway, PostgreSQL restore, object storage, KMS/secrets, observability delivery, design-partner UAT and device/external-host matrices remain governed by `LIVE_GATE_BLOCKERS.md`. They are integrations and operational evidence owners, not new semantic package owners.

## Forbidden duplicate owners

```text
packages/application-deployment/  # deployment-plane already owns deployment
packages/evidence-store/          # action-ledger owns Action/audit truth
packages/transaction-store/       # database shape must not become semantic authority
```

## Production dependency rule

A future package may depend only on the smallest canonical owners needed for its semantics. Integrations implement ports; they do not acquire semantic ownership. Discovery, trust, entitlement, governance, execution and money movement remain separate authorities.
