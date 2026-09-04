# MASTER-38 Reverse-Engineering Report

## Base

Authoritative `main`: `e03118833731c8483d0c42f648fefe446f0a103a`

MASTER-37 merged through PR #197 and established the canonical Application distribution envelope.

## Sources inspected

- `docs/strategy/APPLICATION_NETWORK_THESIS.md`
- `APPLICATION_AUTHORITY.md`
- `APPLICATION_VERSION_MODEL.md`
- `PACKAGE_OWNERSHIP.md`
- `packages/application-package/src/types.ts`
- `packages/application-distribution/src/types.ts`
- `packages/application-distribution/src/validate.ts`
- `packages/protocol-gateway/src/types.ts`
- `packages/protocol/src/versioning.ts`
- `tooling/package-boundaries.config.mjs`

## Findings

1. `ViraApplicationPackage.protocolProjections[]` already owns exact semantic references to supported/desired protocol projection contracts. MASTER-38 must not duplicate this declaration at another Application layer.
2. MASTER-37 `application-distribution` owns exact Application artifact distribution and declared SHA-256 integrity identity. Protocol projection should consume that envelope instead of inventing another source artifact format.
3. Existing `protocol-gateway` adapts tool invocation/results for protocol integrations such as MCP/LangChain. It is not an Application-level protocol egress or projection-fidelity owner.
4. The Application Network thesis explicitly expects protocol egress while preserving Vira canonical semantics. External protocol ecosystems are projection/interoperability surfaces, not canonical semantic owners.
5. Application authority forbids Network/protocol layers from changing the meaning of distributed artifacts or inheriting runtime/governance/effect authority.
6. A generic protocol projection layer cannot prove arbitrary protocol-specific semantic equivalence by itself. It can, however, require explicit fidelity declaration and make lossy/unsupported outcomes impossible to hide.
7. Projection artifacts must remain bound to one exact source Application distribution envelope and one exact `protocolProjection` reference declared by that source Application.
8. Losses must be attributable to canonical Application semantic paths. Silent loss or generic `partial` status would make adapters redefine semantics implicitly.
9. Source digest presence is not source integrity verification. MASTER-38 must not add a `verified` claim or silently treat parsing as trust establishment.
10. URL, endpoint, transport, provider, credential, deployment, authorization and execution details remain outside the canonical projection artifact.

## Frozen direction

Create `@vira-enterprise-genui/application-protocol-projection` with executable dependency boundary:

```text
application-protocol-projection → application-distribution, protocol
```

Artifact shape:

```text
ApplicationProtocolProjectionArtifact
├─ schemaVersion
├─ source: ViraApplicationDistributionEnvelope
├─ projectionRef: exact ref declared by source.application.protocolProjections[]
└─ result
   ├─ lossless { payload }
   ├─ lossy { payload, losses[] }
   └─ unsupported { reason }
```

`lossy.losses[]` paths are bounded, unique and rooted at canonical `$.application` semantics. `unsupported` cannot carry a projected payload. `lossless` cannot carry hidden loss metadata.

The artifact is projection data only. It does not verify source integrity, resolve network locations, select providers, deploy, authorize, govern or execute anything.
