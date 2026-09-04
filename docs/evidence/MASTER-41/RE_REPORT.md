# MASTER-41 Reverse Engineering

Base authoritative `main`: `b425e5e7104c1a6441671301a6ac262e4e15e1bb`.

## Nearest owners

- `application-package` owns Application identity/version and publisher-declared distribution metadata (`visibility`, `discoverable`).
- `application-distribution` owns the canonical Distribution envelope, deterministic serialization and explicit integrity verification gate.
- `application-publisher-sdk` prepares envelopes but owns no transport/registry.
- `application-ai-host-sdk` consumes Distribution envelopes and requires explicit integrity verification before host compatibility success.
- `experience-registry` owns Experience Pack registry snapshots only; extending it to Application federation would conflate Experience and Application semantic families.
- `enterprise-registry` remains tenant/private approval infrastructure and is not a public/federated Application discovery owner.

## Owner gap

There is no canonical Application-level federated discovery snapshot that can:

1. carry exact canonical Distribution envelopes from multiple host-asserted federation sources;
2. preserve source provenance without claiming source authentication;
3. reject private/organization/non-discoverable releases from public federation data;
4. detect disagreement on the same exact Application `id@version` without source priority or implicit latest;
5. provide deterministic exact-release lookup.

## MASTER-41 boundary

New package: `@vira-enterprise-genui/application-federation`.

Dependency boundary:

```text
application-federation → application-distribution, protocol
```

The package owns only provider-neutral federation snapshot parsing, deterministic serialization, exact-release conflict detection and exact lookup.

It does not own URLs/endpoints/transports, source authentication/signatures, registry persistence, ranking, recommendation, latest resolution, integrity verification, deployment/runtime, governance/authorization/entitlement, protocol adapter execution, Capability invocation or protected Action execution.

## Trust model

`sourceId` is provenance data, not authentication. Distribution digests inside federation snapshots remain declarations; federation parsing does not mark them verified. Consumers that need trust must use the existing Distribution integrity-verification owner (directly or via AI-host SDK).

## Conflict model

The same exact Application `id@version` may appear from multiple sources only when the deterministic canonical Distribution envelope is identical. Different envelopes/digests for the same exact release fail the entire snapshot with `FEDERATION_CONFLICT`. No source priority, majority vote, latest alias or silent fallback exists.
