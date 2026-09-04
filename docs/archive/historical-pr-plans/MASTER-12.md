# MASTER-12 — Organization / Project / Environment / Secrets

## Responsibility

Introduce the enterprise execution scope used by later control-plane surfaces without changing the portable Experience contract or the provider-neutral MASTER-09 governance core.

```text
Organization
  └── Project
       └── Environment (dev | staging | production)
            ├── user / agent / service principals
            └── SecretRef -> trusted broker -> opaque SecretLease
```

## Invariants

1. Organization, project and environment identity is exact and bounded.
2. Cross-organization principals fail closed before provider execution.
3. A SecretRef is bound to one exact organization/project/environment.
4. Vira public APIs never return raw secret material. Trusted brokers return opaque leases/handles only.
5. Broker responses with extra fields or raw-secret-shaped values are rejected.
6. MASTER-09 governance remains provider-neutral and does not depend on enterprise-context.
7. `enterprise-governance` adapts exact scope/principals into governance and approval provider calls.
8. Enterprise governance providers and approval providers receive the same immutable scope snapshot.
9. Secret broker/provider implementations remain injected; Vira does not own vault/KMS vendor SDKs in this phase.
10. Environment promotion/deployment remains MASTER-11 ownership.

## Packages

- `@vira-enterprise-genui/enterprise-context`
- `@vira-enterprise-genui/enterprise-governance`

## Out of scope

- a vault implementation or raw credential store;
- organization CRUD persistence;
- SCIM/SAML provisioning;
- policy authoring UI;
- deployment state machine;
- audit ledger persistence.

## Verification policy

Hosted CI is deferred. Final local/full CI must cover cross-org/project/environment rejection, opaque secret leases, raw-secret response rejection, provider/approval scope projection, public facade exports and package-boundary hygiene.
