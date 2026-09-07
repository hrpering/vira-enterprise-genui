# PROD-19 Provisional Repository Closure

**Status:** `PROVISIONAL_CODE_COMPLETE` only. `releaseAuthority=forbidden`.

This closure composes PROD-19 repository contracts on one exact source tree without converting deferred live Network evidence into a development blocker.

## Exact repository composition

`tooling/verify-prod19-provisional.mjs` requires all of these boundaries to coexist:

1. authenticated Application federation source admission with exact publisher/key revision, expiry and revocation semantics;
2. bounded pagination and content-addressed cache validators;
3. explicit Capability provider routing with trust/SLA/location/commercial constraints and declared-only failover;
4. MCP/A2UI/AG-UI/custom SDK protocol-family conformance with Action Boundary-only Action authority;
5. the existing Application protocol projection proof that prevents protocol compatibility from inventing undeclared Application projections.

The closure verifier is intentionally repository-evidence based. It is suitable for architecture progression, not production release authorization.

## Security invariants preserved

- publisher/source trust is separate from transport integrity;
- transport cache validation cannot create publisher authority;
- provider routing cannot silently substitute an undeclared provider;
- provider trust evidence must remain valid and exact;
- model/compute/node supply uses the same Capability routing primitive;
- protocol conformance never emits Action execution authority;
- Application projection proof remains required separately from protocol ingress normalization.

## Deferred live release evidence

The following remain open release-authority evidence:

- public Network live endpoints;
- production CDN/cache behavior;
- real publisher key rotation/revocation;
- measured provider SLO/region/commercial evidence;
- live provider failover drill;
- external protocol counterpart interoperability;
- outstanding PROD-17/18 live release authority.

These items must close before a production-authoritative Network release claim, but they do not block continued repository development.
