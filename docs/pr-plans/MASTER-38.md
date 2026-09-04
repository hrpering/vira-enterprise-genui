# MASTER-38 — Application Protocol Projection Contract

## Goal

Add the first Application-level protocol egress contract so exact distributed Application semantics can be projected into external protocol payloads with explicit `lossless | lossy | unsupported` fidelity, without turning protocol adapters into canonical semantic, transport, runtime or governance owners.

## Base

- authoritative `main`: `e03118833731c8483d0c42f648fefe446f0a103a`
- previous phase: MASTER-37 merged via PR #197
- branch: `master/38-application-protocol-projection`

## Existing owners

- `application-package` owns exact `protocolProjections[]` declarations.
- `application-distribution` owns exact source Application distribution envelope + declared artifact integrity identity.
- `protocol-gateway` owns existing tool/protocol adaptation only.
- runtime, deployment, governance, entitlement and Action owners retain their existing authority.

## New owner

`@vira-enterprise-genui/application-protocol-projection` owns only:

- strict Application protocol projection artifact shape;
- exact source `ViraApplicationDistributionEnvelope` delegation;
- exact `projectionRef` membership against source `application.protocolProjections[]`;
- explicit fidelity result variants;
- bounded canonical semantic loss reporting for lossy projection;
- deterministic projection artifact serialization;
- safe/frozen arbitrary protocol payload data.

It does not own:

- protocol-specific adapter implementation;
- URLs/endpoints/transports/federation;
- provider or credential binding;
- source integrity verification;
- Application discovery metadata or projection declarations;
- registry/search/ranking;
- deployment/runtime state;
- governance/authorization/entitlement;
- Capability or protected Action execution.

## Contract

```text
ViraApplicationProtocolProjectionArtifact {
  schemaVersion: "1"
  source: ViraApplicationDistributionEnvelope
  projectionRef: exact source.application.protocolProjections[] ref
  result:
    | { fidelity: "lossless", payload }
    | { fidelity: "lossy", payload, losses[] }
    | { fidelity: "unsupported", reason }
}
```

Loss entries:

```text
{
  path: canonical $.application semantic path
  reason: bounded safe text
}
```

Loss paths are unique, bounded and sorted deterministically. `lossless` cannot include loss metadata. `unsupported` cannot include a payload.

## Package boundary

```text
application-protocol-projection → application-distribution, protocol
```

## Security / semantic invariants

- full input passes shared safe JSON boundary before inspection;
- source parsing delegates to `application-distribution` and preserves owner failure context;
- projection ref must exactly match one source-declared projection ref; no implicit/floating alias resolution;
- fidelity must be exactly `lossless`, `lossy`, or `unsupported`;
- lossy projection requires at least one explicit canonical Application semantic loss;
- arbitrary payload remains non-canonical protocol data and is deeply frozen;
- deterministic serialization sorts payload object keys and semantic loss entries;
- source digest declaration is carried but not promoted to a `verified` trust claim;
- transport/provider/credential/execute/authorize/deploy smuggling fails closed;
- projection success grants no runtime, governance, entitlement or effect authority.

## Focused verification

```bash
pnpm check:boundaries
pnpm typecheck
pnpm vitest run \
  tests/contract/application-protocol-projection.test.ts \
  tests/contract/application-protocol-projection-hardening.test.ts
```

## Q0–Q9

- Q0 PASS — fresh branch from exact `e03118833731c8483d0c42f648fefe446f0a103a`.
- Q1 PASS — targeted RE of Application Package/Distribution, protocol gateway, authority/version model and boundary graph.
- Q2 PASS — ownership/fidelity/non-authority invariants frozen.
- Q3 PASS — projection contract implementation added.
- Q4 PASS — focused contract/security/determinism/hardening coverage added.
- Q5 REQUIRED — final security/fail-closed review.
- Q6 REQUIRED — final architecture/ownership review.
- Q7 REQUIRED — exact-head local boundaries/typecheck/focused tests.
- Q8 REQUIRED — actual PR diff review and post-Q7 executable-clean compare.
- Q9 BLOCKED until Q7/Q8; then exact-head squash merge and MASTER-39 starts from resulting new authoritative `main`.
