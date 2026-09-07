# PROD-18 Provisional External Host Identity Boundary

**Status:** provisional code-complete workstream. This document does not claim PROD-17 Q9, production deployment authority, or PROD-18 production closure.

## Owner decision

The nearest canonical owner is `enterprise-context`, because it already owns verified external identity mapping, enterprise principal/scope semantics, membership revision, delegation audience, expiry and revocation.

A new identity package is intentionally not introduced. `application-ai-host-sdk` remains a compatibility/integrity SDK and must not acquire authorization or execution authority. OIDC signature/issuer/audience/time verification remains upstream in `integrations/identity-oidc`.

## New composition primitive

`authorizeExternalHostContext` consumes a **trusted host binding** plus already-verified external identity evidence and canonical enterprise membership/delegation records.

The trusted binding pins:

- one logical external host id;
- one exact workload `agent` or `service` principal;
- one workload audience;
- optionally one OIDC authorized-party/client id.

The function then:

1. rejects wrong-host audience and authorized-party replay;
2. resolves external identity to an exact active tenant membership and membership revision;
3. resolves the existing exact-scope delegation chain to the trusted workload principal;
4. inherits existing expiry and revocation failure semantics;
5. returns frozen identity/delegation evidence only.

It does **not** return tokens, credentials, provider secrets, deployment permission, entitlement, governance approval, or protected Action execution authority.

## Security invariants

- Host ids and workload principals come from trusted configuration, not request claims.
- A user principal cannot be configured as a machine workload principal.
- Cross-project/environment membership reuse fails closed.
- Delegation audience must equal the trusted host audience exactly.
- Revoked or expired delegation cannot be recovered through fallback.
- Expired external identity cannot be upgraded into a host authorization.
- Compatibility success from `application-ai-host-sdk` is independent and cannot substitute for this identity boundary.

## Parallel release semantics

Live PROD-17 governance/deploy/restore/UAT/SLO gates remain release-authority gates, but they do not block provisional PROD-18 implementation. Until those live gates close, this work may be merged only as code-complete/provisional infrastructure and must not be represented as a production-authoritative PROD-18 dependency.
