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

## Planned new thin owners and earliest phase

| Concern | Planned owner | Earliest phase |
|---|---|---:|
| exact Application resolution | `application-resolution` | PROD-05 |
| durable Application coordination | `application-runtime` | PROD-08 |
| provider connection lifecycle | `provider-connection` | PROD-07 |
| provider trust | `provider-trust` | PROD-09 |
| exact Action binding discovery | `action-supply` | PROD-10 |
| transaction meaning | `action-transaction` | PROD-10 |
| one-time execution grant | `execution-grant` | PROD-11 |
| durable protected execution | `durable-execution` | PROD-12 |
| private provider execution | `private-runner` | PROD-12 |
| postcondition semantics | `action-verification` | PROD-13 |
| artifact identity/lineage | `artifact-contract` | PROD-08 |
| durable persistence adapters | `integrations/postgres` | PROD-02 onward |
| artifact bytes | `integrations/object-store` | PROD-08 |

No planned owner exists merely because this table names it. Its owning phase must still record nearest-owner analysis, permitted dependency edges, failure semantics, tests and migration/rollback where applicable.

## Forbidden duplicate owners

```text
packages/application-deployment/  # deployment-plane already owns deployment
packages/evidence-store/          # action-ledger owns Action/audit truth
packages/transaction-store/       # database shape must not become semantic authority
```

## Production dependency rule

A future package may depend only on the smallest canonical owners needed for its semantics. Integrations implement ports; they do not acquire semantic ownership. Discovery, trust, entitlement, governance, execution and money movement remain separate authorities.
