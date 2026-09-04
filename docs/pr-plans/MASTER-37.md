# MASTER-37 — Application Distribution Contract

## Goal

Establish the first canonical Vira Network distribution boundary: distribute one exact canonical `ViraApplicationPackage` release with explicit artifact-integrity identity, without creating a second Application schema, registry, transport, provider binding, deployment path or execution authority.

## Base

- authoritative `main`: `2e1b509ca9d7c0c1c0179746bec95fa7f2bed016`
- previous phase: MASTER-36 merged via PR #196
- branch: `master/37-distribution-contract`
- corrected frozen executable head: `ad9745334e0cedfe2b7d28ee06435f498e62e7c4`

## Reverse-engineered owners

Existing owners remain canonical:

- `application-package` owns Application identity/version, distribution metadata, compatibility and exact `protocolProjections[]` references.
- `experience-registry` owns Experience Pack manifest snapshot/lookup only.
- `enterprise-registry` owns tenant-scoped private approval registry concerns only.
- `protocol-gateway` owns existing tool/protocol adaptation, not Application discovery/distribution semantics.
- `deployment-plane` owns existing Experience Pack signing/promotion/deployment truth; MASTER-37 does not redefine it as Application Network distribution.
- runtime, governance and Action owners retain all execution/security authority.

## New owner

`@vira-enterprise-genui/application-distribution` owns only:

- strict distribution-envelope shape;
- canonical parsed `ViraApplicationPackage` embedding by delegation;
- exact SHA-256 artifact-integrity identity;
- deterministic envelope serialization around the canonical Application serialization;
- fail-closed integrity verification through an injected verifier.

It does not own:

- Application discovery metadata, visibility, compatibility or protocol projection semantics — these remain inside `application-package`;
- URL/endpoint/transport/federation/provider/credential semantics;
- registry persistence or `latest` resolution;
- entitlement, authorization or governance;
- deployment/runtime state;
- Capability/Action execution;
- digest computation/provider implementation.

## Contract

```text
ViraApplicationDistributionEnvelope {
  schemaVersion: "1"
  application: ViraApplicationPackage
  integrity: {
    algorithm: "sha256"
    digest: 64-char lowercase hex
  }
}
```

The envelope is distribution data. Parsing validates the declared integrity identity but does not claim the bytes have been verified. `verifyViraApplicationDistributionIntegrity()` receives an injected verifier and verifies the digest against `serializeViraApplicationPackage(application)`, the canonical Application artifact bytes/string for this contract.

## Invariants

- exact Application release/version rules are delegated to `application-package`;
- no implicit `latest`, fallback, provider substitution or network resolution;
- discovery/visibility/protocol metadata is never copied into a second top-level schema;
- integrity verification is explicit and fail-closed;
- verifier false/throw/non-`true` all fail closed;
- unknown provider/url/endpoint/transport/credential/execute/authorize/deploy fields fail closed;
- shared safe JSON boundary rejects accessors, custom prototypes and non-JSON inputs;
- deterministic serialization reuses canonical Application serialization rather than forking it;
- distribution success grants no execution, entitlement, governance or deployment authority.

## Package boundary

```text
application-distribution → application-package, protocol
```

No other executable dependency is permitted in MASTER-37.

## Q5 security review

PASS.

- root input passes through shared `parseJsonValue()` before field inspection;
- root and integrity envelopes are exact-shape and reject authority/transport smuggling;
- canonical Application validation is delegated to `parseViraApplicationPackage()` and preserves canonical failure code/path context;
- v1 integrity identity is restricted to one exact lowercase 64-hex SHA-256 digest;
- parsing a digest declaration does not mark it verified;
- integrity verification checks the canonical Application serialization through an injected verifier input, not mutable caller bytes;
- verifier input is frozen and false, exception, missing verifier or any non-`true` result fails closed;
- prototype-sensitive names remain inert data and exact-shape validation rejects them;
- accessor/custom-prototype inputs fail before application logic executes.

## Q6 architecture review

PASS.

- executable dependencies are exactly `application-package` and `protocol`;
- no changes are made to `experience-registry`, `enterprise-registry`, `protocol-gateway`, `deployment-plane`, runtime, governance or Action owners;
- package discovery metadata, visibility, compatibility, protocol projections and commercial refs are consumed from the canonical Application package rather than duplicated;
- deterministic envelope serialization composes `serializeViraApplicationPackage()` rather than creating a competing Application canonicalizer;
- the public API has parse/serialize/integrity-verification only: no publish, deploy, resolve, execute, authorize, entitle, route or provider binding method exists.

## Local Q7 history

First exact-head run on `41fa04d7af4c5a68fa4eff1cb4a2403bff4dbaac`:

- `pnpm check:boundaries` PASS;
- focused `application-distribution` tests 13/13 PASS;
- `pnpm typecheck` failed with one test-only TS7006 implicit-any parameter in the verifier callback.

The correction changes only the focused test and annotates that callback parameter with the already-exported `ViraApplicationDistributionVerifierInput`. Production implementation is unchanged. Corrected frozen executable head: `ad9745334e0cedfe2b7d28ee06435f498e62e7c4`.

## Focused verification

```bash
pnpm check:boundaries
pnpm typecheck
pnpm vitest run tests/contract/application-distribution.test.ts
```

## Q0–Q9

- Q0 PASS — branch created fresh from exact authoritative main `2e1b509ca9d7c0c1c0179746bec95fa7f2bed016`.
- Q1 PASS — targeted RE of Application/version/authority, registries, protocol gateway and deployment plane.
- Q2 PASS — Application Distribution Contract ownership/invariants frozen.
- Q3 PASS — package implementation added.
- Q4 PASS — focused contract/integrity/security/non-authority coverage added.
- Q5 PASS — security/fail-closed review.
- Q6 PASS — architecture/ownership review.
- Q7 CORRECTED EXACT-HEAD RETEST REQUIRED.
- Q8 PRE-Q7 PASS — executable scope reviewed; after corrected frozen head only docs/status changes are allowed. Final post-Q7 compare still required.
- Q9 BLOCKED until corrected Q7/final Q8; then exact-head squash merge and next distribution phase starts from new authoritative `main`.

Hosted verify/iOS/Android jobs on the branch ended with zero steps / runner id 0 and remain infrastructure non-signal only.
