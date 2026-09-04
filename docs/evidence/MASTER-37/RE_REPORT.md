# MASTER-37 Reverse-Engineering Report

## Base truth

Authoritative base: `2e1b509ca9d7c0c1c0179746bec95fa7f2bed016`.

MASTER-36 is merged via PR #196. MASTER-37 branch was created directly from that exact main SHA.

## Owners inspected

### `application-package`

Canonical owner of Application release identity/version, publisher, exact semantic references, host compatibility, `protocolProjections[]`, `distribution` metadata and commercial references. Distribution must reference/use this package rather than re-declare those fields.

### `APPLICATION_VERSION_MODEL.md`

Execution is exact-identity bound. `latest` is discovery convenience only, never implicit protected-execution identity. Application release identity requires explicit release version plus exact artifact integrity. A digest is integrity identity only; it does not imply compatibility, authorization or deployment state.

### `APPLICATION_AUTHORITY.md`

Network may discover releases/capability supply, distribute exact identities/artifacts, expose compatibility/availability/provenance metadata and route demand. Network may not change artifact meaning, bypass registry/deployment/governance, execute protected effects or conflate entitlement with authorization.

### `experience-registry`

Owns Experience Pack manifest snapshots and exact Pack lookup. It is not an Application Network distribution owner and must not be broadened into one implicitly.

### `enterprise-registry`

Owns scoped private enterprise approvals over existing kinds. Its tenant/environment approval semantics are not public/federated Application distribution semantics.

### `protocol-gateway`

Owns existing protocol/tool adaptation (`mcp`, `langchain`) into canonical tool results. It is not Application artifact distribution/discovery authority.

### `deployment-plane`

Owns signed Experience Pack artifact and environment promotion/deployment state. It currently speaks Pack identities and deployment revisions. MASTER-37 must not reuse those operational records as Application release distribution truth.

### `protocol`

Provides the shared safe JSON boundary used by canonical contracts. It remains transport-neutral.

## Gap

There is no canonical provider-neutral Application distribution artifact envelope that:

1. contains one canonical exact `ViraApplicationPackage` release;
2. binds it to an explicit artifact integrity identity;
3. serializes deterministically around the existing canonical Application serializer;
4. can fail closed on integrity verification without embedding provider/transport/deployment authority.

## Decision

Add `@vira-enterprise-genui/application-distribution` with only `application-package` and `protocol` dependencies.

Canonical v1 envelope:

```text
{
  schemaVersion: "1",
  application: ViraApplicationPackage,
  integrity: {
    algorithm: "sha256",
    digest: <64 lowercase hex>
  }
}
```

## Explicit non-owners

MASTER-37 does not own:

- discovery catalog persistence/search/ranking;
- implicit `latest` resolution;
- URLs, endpoints or federation transport;
- protocol-specific rendering/projection payloads;
- provider credentials/bindings;
- publisher signing infrastructure;
- deployment or runtime state;
- entitlement/governance/authorization;
- Capability or Action execution.

These omissions are intentional boundaries for later distribution phases or existing canonical owners.
