# Production integrations root

Infrastructure adapters live here and consume canonical package contracts without becoming semantic owners.

- `postgres/` — PROD-02 migration authority, tenant-scoped transaction primitives, and PostgreSQL verification foundation.
- `identity-oidc/` — PROD-03 cryptographic OIDC/JWKS verification adapter. It emits verified external identity into the canonical enterprise-context owner; it never decides tenant membership.
- `browser-session/` — PROD-03 same-origin opaque browser-session/CSRF host primitive. It stores no raw OIDC token and consumes existing security/CSP requirements.

Database shape, OIDC provider details, and browser cookie mechanics are infrastructure details. Application, runtime, transaction, ledger, governance, enterprise scope/principal/delegation, commercial, and provider semantics remain in their canonical package owners.
