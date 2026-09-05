# Browser session host adapter

The browser never receives a reusable OIDC access/refresh token from this adapter.

`issueBrowserSession()` creates a 256-bit opaque session handle and returns:

- a `__Host-vira_session` cookie with `Path=/; HttpOnly; Secure; SameSite=Lax`;
- a session-bound CSRF token for an explicit request header;
- a persistence record containing only SHA-256(session handle), canonical principal/scope, membership revision, and expiry.

Unsafe requests require exact HTTPS Origin, same-origin Fetch Metadata when present, and the session-bound CSRF token. CSP is derived from the existing `security` package's CSP/network owner instead of being redefined here. CORS mode is same-origin-only.
