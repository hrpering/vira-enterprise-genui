# PROD-19B Provisional Bounded Federation Transport

**Status:** provisional repository contract. No public Application Network deployment or release-authority claim.

## Reverse-engineered owner decision

`application-federation` already owns canonical public/discoverable Application source admission, source/application bounds, duplicate/conflict semantics and the PROD-19A publisher/source trust boundary. Network pagination therefore extends this owner rather than creating a second network runtime.

`application-resolution` remains the exact enterprise deployment resolver. It already revalidates cached signed Application artifacts and trusted environment bindings; public Network page transport does not belong inside that resolver.

## Transport contract

A request pins an exact semantic `sourceId`, an opaque bounded cursor, a caller-selected page size capped at 128 entries and an optional strong `If-None-Match` validator.

A page response must bind:

- the exact source id;
- the exact request cursor;
- a distinct bounded next cursor;
- no more applications than the caller requested;
- a canonical V2 federation source fragment;
- a SHA-256 content digest;
- a strong content-addressed ETag of `"sha256:<digest>"`.

Canonical page bytes include the source id, request cursor, next cursor and canonical V2 federation snapshot before the injected SHA-256 provider is evaluated. Cursor/source substitution therefore changes the validator input instead of sharing a cache key.

## Cache-poisoning boundary

`not-modified` is accepted only when the caller supplies a previously validated cache validator whose exact source id, request cursor, digest and ETag all match both the conditional request and the response. A 304-style response by itself never authorizes reuse of arbitrary cached bytes.

Empty pages cannot advance to hidden cursors, and a page cannot return its own request cursor as `nextCursor`.

## Trust separation

Transport integrity is not publisher authenticity. A validated page is only bounded, canonical and content-addressed transport evidence. Its source fragment still needs the PROD-19A source trust/attestation boundary before publisher identity is trusted. Transport validation grants no Application execution, Action, credential, entitlement or provider authority.

## Deferred release evidence

Live public Network endpoints, CDN/cache behavior, real publisher key rotation and cross-region operation remain external release evidence. They do not block repository contract development and cannot be inferred from this provisional slice.
