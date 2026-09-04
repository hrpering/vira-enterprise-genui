# MASTER-38 — Application Protocol Projection Contract

## Goal

Add the first Application-level protocol egress contract so exact distributed Application semantics can be projected into external protocol payloads with explicit `lossless | lossy | unsupported` fidelity, without turning protocol adapters into canonical semantic, transport, runtime or governance owners.

## Base

- authoritative `main`: `e03118833731c8483d0c42f648fefe446f0a103a`
- previous phase: MASTER-37 merged via PR #197
- branch: `master/38-application-protocol-projection`
- corrected frozen executable head: `73f99f85f9f0226591d6161825857b40541455b3`

## Existing owners

- `application-package` owns exact `protocolProjections[]` declarations.
- `application-distribution` owns exact source Application distribution envelope + declared artifact integrity identity.
- `protocol-gateway` owns existing tool/protocol adaptation only.
- runtime, deployment, governance, entitlement and Action owners retain their existing authority.

## New owner

`@vira-enterprise-genui/application-protocol-projection` owns only strict Application protocol projection artifact shape, exact source distribution delegation, exact projection-ref membership, explicit fidelity variants, bounded canonical semantic-loss reporting, deterministic projection serialization and safe/frozen arbitrary protocol payload data.

It does not own protocol-specific adapter implementation, URLs/endpoints/transports/federation, provider/credential binding, source integrity verification, Application projection declarations, registry/search/ranking, deployment/runtime state, governance/authorization/entitlement, Capability invocation or protected Action execution.

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

Loss entries use a strict canonical Application path grammar:

```text
$.application
$.application.field
$.application.array[0].field
```

Paths are bounded, unique and sorted deterministically. `lossless` cannot include loss metadata. `unsupported` cannot include a payload.

## Fidelity interpretation

`fidelity` is an explicit adapter projection report. This generic contract validates that an adapter cannot silently hide a reported loss or unsupported outcome; it does not mathematically prove arbitrary protocol-specific semantic equivalence. Protocol-specific conformance proof remains a separate adapter/conformance concern.

## Package boundary

```text
application-protocol-projection → application-distribution, protocol
```

## Q5 security / fail-closed review

PASS.

- full input passes shared `parseJsonValue()` before inspection;
- source parsing delegates to `application-distribution` and preserves owner failure context;
- `projectionRef` must exactly equal a ref declared in source Application `protocolProjections[]`; implicit/latest aliases cannot resolve;
- exact result variants reject unknown loss/control fields;
- lossy projection requires at least one bounded unique semantic loss;
- canonical loss path grammar rejects prefix collisions and malformed indexes/segments;
- loss collection is explicitly bounded;
- arbitrary protocol payload is detached/deeply frozen and deterministic serialization sorts object keys;
- prototype-sensitive payload names remain inert data through the shared JSON boundary;
- root/result transport/provider/credential/execute/authorize/deploy smuggling fails closed;
- source digest declaration is not upgraded into a `verified` trust assertion.

## Q6 architecture / ownership review

PASS.

- executable dependency boundary is exactly `application-distribution` + `protocol`;
- source Application declarations remain owned by `application-package` through the distribution envelope;
- existing `protocol-gateway` remains tool/protocol invocation adaptation owner and is not modified;
- no registry, network transport, provider, deployment, runtime, governance, entitlement or Action owner is imported or changed;
- projection payload is non-canonical interoperability data and cannot redefine Vira Application semantics;
- projection success or `lossless` report grants no execution, authorization, governance or deployment authority.

## Local Q7 history

First exact-head local run on `0728072b19e4b73cb654bab1b724e2aefbbdb99b`:

- `pnpm check:boundaries` PASS;
- focused projection suites PASS, 16/16 tests;
- `pnpm typecheck` failed with two TS7053 errors because TypeScript 6 did not narrow `JsonArray | JsonObject` to a string-indexable `JsonObject` after the array branch inside `freezeJson()` and `canonicalJson()`.

The correction is semantic-neutral: each object branch now explicitly binds `const object = value as JsonObject` before key indexing. Commit `73f99f85f9f0226591d6161825857b40541455b3` changes only `packages/application-protocol-projection/src/validate.ts` at those two narrowing points.

Corrected exact-head local run on `73f99f85f9f0226591d6161825857b40541455b3` is operator-reported PASS for:

```bash
pnpm check:boundaries
pnpm typecheck
pnpm vitest run \
  tests/contract/application-protocol-projection.test.ts \
  tests/contract/application-protocol-projection-hardening.test.ts
```

Verification evidence is recorded in `docs/evidence/MASTER-38/VERIFICATION.md`.

## Q0–Q9

- Q0 PASS — fresh branch from exact `e03118833731c8483d0c42f648fefe446f0a103a`.
- Q1 PASS — targeted RE of Application Package/Distribution, protocol gateway, authority/version model and boundary graph.
- Q2 PASS — ownership/fidelity/non-authority invariants frozen.
- Q3 PASS — projection contract implementation added.
- Q4 PASS — focused contract/security/determinism/hardening coverage added.
- Q5 PASS — security/fail-closed review.
- Q6 PASS — architecture/ownership review.
- Q7 PASS — corrected exact-head local gate.
- Q8 FINAL COMPARE REQUIRED — executable scope was clean pre-Q7; corrected frozen head must remain executable-clean through closure.
- Q9 BLOCKED until final Q8; then exact-head squash merge and MASTER-39 starts from resulting new authoritative `main`.

Hosted verify/iOS/Android jobs ended with `steps: null` and remain infrastructure non-signal.
