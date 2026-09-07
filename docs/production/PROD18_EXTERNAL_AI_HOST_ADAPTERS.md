# PROD-18 Provisional External AI-Host Adapter Contract

**Status:** repository contract only. No claim that ChatGPT, Copilot, Claude or a customer agent is live-connected or production-authorized.

## Owner decision

`application-ai-host-sdk` already owns AI-host compatibility and protocol-projection planning. The external adapter primitive therefore lives there rather than creating provider-specific execution owners.

Identity remains separate in `enterprise-context`; OIDC verification remains in `integrations/identity-oidc`; protected execution remains behind the Action Boundary.

## Host-neutral adapter profile

One compatibility-only profile covers representative host families:

- `chatgpt`;
- `copilot`;
- `claude`;
- `customer-agent`.

A profile pins:

- exact adapter id;
- exact Vira version;
- UX/workflow features the adapter can represent;
- required host capabilities already evaluated by the existing SDK;
- one exact protocol projection already proven compatible.

The planner reuses the canonical Application exact-reference parser, including its rejection of floating aliases such as `latest` or `main`.

## Non-authority boundary

The adapter plan deliberately contains no endpoint, token, credential, tenant membership, delegation grant, entitlement, approval authority or Action execution primitive. A successful adapter plan only means: **this host family can represent this already-validated Application through this exact compatible projection.**

Actual external-host authentication must pass the PROD-18 identity boundary independently. Actual protected effects must still pass the existing Action Boundary.

## Parallel semantics

Provider-specific live connectivity can be proven later without blocking this host-neutral contract. Until then the named host families are compatibility paths, not production deployment claims.
