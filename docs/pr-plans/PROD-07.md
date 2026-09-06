# PROD-07 — SaaS Integration Factory and Provider Connection

**Status:** PROVISIONAL STACKED IMPLEMENTATION  
**Dependency base:** `prod/05-dependency-join@29754756b6a2b62318edab8db164d5eb98b02267`  
**Dependencies represented by that join:** PROD-01 + PROD-02 + PROD-03 + PROD-04  
**Branch:** `prod/07-provider-integration-factory`

## Authority freeze

- `provider-connection` owns tenant/environment-scoped connection metadata and lifecycle only.
- New connections begin `pending`; untrusted input cannot assert an already-active lifecycle state.
- `enterprise-context` remains the owner of enterprise scope and `SecretRef`; raw credential values never enter the connection contract.
- `adapter-sdk` owns Connector Kit declaration/import ergonomics.
- `capability-contract` remains exact query Capability reference owner.
- `application-package` remains the exact Action reference owner used by Application V2.
- Connector metadata is not authentication, provider trust, entitlement, governance, execution permission, or payment authority.
- Provider write/effect operations cannot be mapped to query Capabilities; protected effects bind to exact Action references and remain behind later Action Boundary phases.
- A connection selects one declared auth profile; operations belonging to another profile cannot be smuggled through matching scope names.

## Initial slice

- Connector Kit declaration for OpenAPI/MCP/manual REST/SDK sources.
- OAuth2 PKCE, API key, service-account, signed JWT and OIDC auth profiles.
- Scope, resource/schema, pagination, rate-limit, inline/poll/webhook, canonical error-normalization, idempotency/retry/verification declarations.
- Safe query-only sandbox probe.
- Provider connection lifecycle: pending → active/revoked/expired, with revoked/expired terminal behavior.
- Exact operation bindings: query → CapabilityRef, effect → ActionRef.
- Reference GitHub and Google Workspace query connectors plus exact connection fixtures.
- Focused gates: `verify:connector-sdk` and `verify:provider-connection`.

## Security and failure posture

- Unknown fields, raw secret fields, malformed schemas, undeclared scopes and invalid rate-limit declarations fail closed.
- A provider operation declared as a write cannot be reclassified as a query.
- Effect declarations require postcondition verification, explicit idempotency and non-query retry semantics.
- Sandbox probes are query-only and cannot exercise protected effects.
- Floating Capability/Action references are rejected by their canonical reference owners.
- Revoked/expired connections cannot be reactivated by the lifecycle helper.
- Nested operation bindings and targets are immutable after validation.

## Explicit non-goals

No raw secret storage, OAuth token exchange, provider trust/attestation, durable async jobs, protected Action execution, retry/failover engine, ranking, or production network calls are owned by this slice. Those remain with later production phases and concrete integration adapters.

This phase remains provisional and must not merge before PROD-00 and its dependency stack close in order.
