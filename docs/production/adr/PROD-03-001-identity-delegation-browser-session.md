# ADR PROD-03-001 — Identity, delegation and browser session boundary

**Status:** ACCEPTED for PROD-03 candidate  
**Date:** 2026-09-05

## Decision

Canonical enterprise identity remains owned by `enterprise-context`.

Existing canonical principal kinds stay unchanged:

```text
user | agent | service
```

PROD-03 extends that owner with three concepts only:

1. `ViraVerifiedExternalIdentity` — cryptographically verified external issuer/subject/audience evidence;
2. exact `ViraIdentityMembership` — binds that evidence to one canonical principal and exact enterprise scope;
3. bounded `ViraDelegationGrant` chain — lets an authenticated canonical principal delegate to another canonical principal for one exact scope and audience.

OIDC provider mechanics, browser cookie mechanics, Vercel hosting and PostgreSQL remain integrations/adapters, not semantic authorities.

## OIDC

The production verifier validates compact JWS signatures against an explicitly configured issuer, audience, algorithm set and JWKS. It fail-closes on unsupported algorithms, duplicate/missing keys, bad signatures, issuer/audience confusion, invalid subject, expiry/not-before/issued-at violations, token-age violations and nonce mismatch.

All public verification inputs are treated as runtime-untrusted values. Malformed configuration, JWKS, token, clock or nonce input returns deterministic failure rather than relying on TypeScript types or throwing through the request boundary.

Token-controlled remote key URLs are not accepted. The protected JOSE header is restricted to `alg`, `kid` and optional `typ`.

OIDC claims never self-assign organization/project/environment membership. Managed-provider discovery, authorization-code exchange and JWKS retrieval are deployment adapters around this verifier; their output must still pass the exact configured issuer/JWKS verification boundary before it becomes `ViraVerifiedExternalIdentity` evidence.

## Membership and delegation

Membership authorization requires:

- exact verified issuer + subject;
- active membership;
- exact organization/project/environment scope;
- non-expired membership;
- current membership revision when a browser/session revision is supplied.

Delegation is ordered and bounded to eight grants. Every hop must preserve exact scope and audience, continue from the previous delegate, use the exact previous grant as parent, be active, and not be revoked. Repeated grants, self-delegation, cross-scope grants and stale/revoked grants fail closed.

Membership/delegation public functions accept runtime-untrusted input and reject malformed structures deterministically.

## Browser session

Browser authentication is represented by a server-side opaque session, never by a browser-stored access/refresh token.

The host primitive issues a 256-bit random session handle and persists only its SHA-256 hash. The cookie is:

```text
__Host-vira_session=<opaque>; Path=/; HttpOnly; Secure; SameSite=Lax
```

Unsafe requests require exact HTTPS Origin plus a session-bound CSRF token. Fetch Metadata is enforced as same-origin when supplied. Browser security headers derive CSP connect requirements from the existing `security` owner and use same-origin-only CORS.

A persisted session is authorized only while all of the following remain true:

- the supplied session handle/hash matches the persisted session;
- the session has not expired or been revoked;
- the linked membership remains active and unexpired;
- the persisted session membership revision equals the current membership revision;
- session and membership resolve to the same canonical principal and exact scope.

Changing membership revision therefore invalidates existing sessions without relying on process memory.

## Same-origin Vercel BFF

The browser talks only to the same-origin Vercel BFF. `apps/vira-web/api/bff.ts` terminates the opaque browser cookie and never forwards that cookie or browser authentication material to Railway.

Before a request can leave the Vercel boundary it must pass:

1. exact HTTPS Origin / Fetch Metadata / session-bound CSRF verification;
2. canonical enterprise requested-scope validation;
3. strict `/v1/...` target-path validation;
4. a 65,536-byte request-body limit;
5. JSON parsing with bounded depth/collection sizes and forbidden prototype keys;
6. mandatory rate-limit consumption through a fail-closed external rate-limiter port.

Successful preparation replaces the raw browser session token with its SHA-256 `sessionIdHash`. The prepared envelope therefore contains only:

```text
version + sessionIdHash + canonical scope + method + path + bounded body
```

The prepared envelope is authenticated server-to-server with HMAC-SHA256 over exact timestamp, method, path and body digest. Railway accepts a 60-second replay window and rejects method/path/body tampering.

The concrete rate limiter is a deployment adapter. Source code requires it; missing or unavailable rate-limit configuration fails closed rather than falling back to per-instance memory.

## Railway ingress and PostgreSQL authorization

`apps/vira-api/src/bff-ingress.ts` accepts only signed POST `/v1/bff/proxy` envelopes. Extra envelope fields are rejected; a raw `sessionToken` field cannot cross this boundary.

After server signature verification, the requested scope and `sessionIdHash` are passed to `integrations/postgres`. The adapter reuses the PROD-02 `withTenantTransaction()` port:

```text
BEGIN
→ set transaction-local organization/project/environment
→ vira.require_scope()
→ RLS-scoped browser_session ↔ identity_membership lookup
→ session revocation/revision/principal/scope authorization
→ COMMIT
```

The browser-supplied requested scope is therefore only an RLS selection key. It is not tenant authority. A wrong scope cannot create authority because the RLS lookup returns no matching session/membership row.

Only after persisted session authorization succeeds may the Railway ingress call its downstream `dispatch` port. The dispatch receives canonical principal and exact scope. Upstream response status/body/headers are bounded and allowlisted before returning to the BFF.

`PostgresPoolLike` remains the persistence port. PROD-03 does not add a database driver or create a second persistence owner. Concrete pool construction belongs to the PostgreSQL deployment adapter.

## PostgreSQL

Migration `000002_prod03_identity_delegation.sql` introduces tenant-scoped persistence for:

- `vira.identity_membership`;
- `vira.delegation_grant`;
- `vira.browser_session`.

All three carry the full canonical scope tuple, use FORCE RLS, and use the PROD-02 scope predicates. Delegation parent FKs include the full scope tuple. Browser sessions store only a fixed-length session hash, never raw OIDC/browser tokens. `browser_session.revoked_at` is consumed by the request authorization path, not merely stored.

`vira_identity` is a dedicated NOLOGIN/NOBYPASSRLS service role. `vira_api` is read-only on identity state; `vira_worker` receives no identity table privileges.

## Deployment adapters and external evidence

The following are environment/provider adapters rather than new semantic owners:

- managed OIDC discovery/token endpoint/JWKS transport;
- concrete Vercel rate-limit service or equivalent production rate-limit adapter;
- concrete `PostgresPoolLike` construction for the Railway API process;
- Vercel/Railway secrets for CSRF and BFF server authentication.

Production environment proof must demonstrate that these adapters are configured with separate staging/production secrets and exact origins. Source verification intentionally fails closed when required adapter configuration is absent.

## Proof

Hosted CI must prove:

- valid cryptographic OIDC signature succeeds;
- bad signature, issuer, audience, expiry and nonce are rejected;
- malformed OIDC/identity/delegation/browser runtime inputs fail closed without throwing;
- explicit workload audience is enforced;
- stale/inactive/cross-identity membership is rejected;
- revoked/wrong-audience/broken-parent delegation is rejected;
- session cookie flags and hash-only persistence contract;
- persisted session expiry/revocation/current-membership-revision enforcement;
- exact Origin + CSRF rejection paths;
- body/schema/rate-limit failures stop before Railway dispatch;
- Vercel rate-limit and Railway requests contain session hash rather than raw browser token;
- BFF-to-Railway HMAC detects tampering and replay;
- Railway signed envelope rejects extra/raw-token fields;
- Railway dispatch cannot occur before RLS-backed session authorization;
- CSP has no unsafe inline/eval script source;
- missing-scope identity reads return no rows;
- API mutation and worker reads are denied;
- cross-scope delegation parent FK is denied;
- wrong-tenant browser-session write is denied;
- migration 2 and FORCE RLS survive the existing full PostgreSQL dump/restore gate;
- full repository/browser + iOS + Android regression remains green.
