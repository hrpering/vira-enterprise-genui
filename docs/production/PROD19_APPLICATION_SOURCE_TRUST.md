# PROD-19A Provisional Authenticated Application Source Admission

**Status:** provisional repository contract. No public Network deployment or release-authority claim.

## Reverse-engineered owner decision

`application-federation` already owns Application source bounds, canonical ordering, public/discoverable admission, duplicate handling and exact-release conflict detection. Source authentication therefore extends this owner rather than creating a second federation/runtime package.

The existing federation parser still runs first. Authentication does not weaken or replace `FEDERATION_CONFLICT`, source/application limits, exact release semantics or distribution-envelope validation.

## Trust record

A source trust record pins:

- exact source id;
- publisher identity;
- active key id + monotonically versioned key revision;
- validity window;
- revocation timestamp.

A detached source attestation binds the exact source/publisher/key revision to a canonical source digest and its own bounded validity window.

Digest computation and Ed25519 signature verification are injected cryptographic authorities. The admission function verifies their outputs fail-closed and never receives raw private key material.

## Rotation / revocation semantics

Key rotation is explicit: an attestation signed under a prior revision does not match the active trust record and is rejected. Revoked or expired trust cannot be rescued by a still-valid attestation. Attestation validity may not extend outside the trust window.

## Non-authority boundary

Successful source authentication means only that this canonical federation source was admitted under the configured publisher/key trust record. It grants no Application execution authority, Action authority, entitlement, provider credential or tenant delegation.

## Next network slices

This source-admission layer feeds the existing federation conflict logic. Separate provisional PROD-19 work still needs transport pagination/cache validators, provider routing/failover policy and protocol conformance hardening.
