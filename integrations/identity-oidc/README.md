# OIDC identity adapter

This integration owns provider mechanics only. Canonical principal, organization/project/environment scope, membership and delegation authority remain in `enterprise-context`.

## Verification boundary

`verifyOidcJwt()` performs compact-JWS signature verification and validates explicit issuer, audience, subject, expiry/not-before/issued-at, token age, optional nonce and allowed algorithm/key selection.

Its output is only a `ViraVerifiedExternalIdentity`. OIDC claims never self-assign tenant membership.

The protected JOSE header is intentionally restricted to `alg`, `kid` and optional `typ`; token-selected remote key URLs are not accepted.

## Discovery/JWKS transport

`fetchOidcDiscoveryAndJwks()` provides the reviewed HTTPS discovery path used by production hosts. It requires both:

- an explicitly configured HTTPS issuer; and
- an explicitly configured expected HTTPS JWKS URL.

The discovery URL is derived from the configured issuer. The discovered `issuer` must equal the configured issuer and the discovered `jwks_uri` must equal the explicitly configured expected JWKS URL before any JWKS request is made. Discovery therefore cannot introduce an arbitrary second fetch target.

Metadata and JWKS responses are bounded, redirects fail closed, JSON content type is required, the key set is bounded to 128 keys, and duplicate/invalid `kid` values are rejected.

Production hosts may cache successfully validated key sets outside this semantic integration, but cache refresh must re-enter this same explicit issuer/JWKS validation boundary. Authorization-code exchange and provider credentials are deployment-host concerns; any resulting ID/access token still receives no enterprise authority until cryptographic verification and canonical membership authorization both succeed.
