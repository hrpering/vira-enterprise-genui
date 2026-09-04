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

`@vira-enterprise-genui/application-distribution` owns only strict distribution-envelope shape, canonical parsed `ViraApplicationPackage` embedding by delegation, exact SHA-256 artifact-integrity identity, deterministic envelope serialization around canonical Application serialization, and fail-closed integrity verification through an injected verifier.

It does not own discovery metadata/visibility/compatibility/protocol projection semantics, URL/endpoint/transport/federation/provider/credential semantics, registry persistence or `latest` resolution, entitlement/authorization/governance, deployment/runtime state, Capability/Action execution, or digest-provider implementation.

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

Parsing validates the declared integrity identity but does not claim verification. `verifyViraApplicationDistributionIntegrity()` receives an injected verifier and verifies against `serializeViraApplicationPackage(application)`.

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

## Q5 security review

PASS. Root input passes shared `parseJsonValue()` before field inspection; root/integrity envelopes are exact-shape; canonical Application validation is delegated and preserves owner failure context; v1 integrity identity is exact lowercase SHA-256; parsing does not mark a digest verified; verifier input is frozen; false, exception, missing verifier or non-`true` fail closed; prototype/accessor inputs fail before application logic.

## Q6 architecture review

PASS. Executable dependencies are exactly `application-package` and `protocol`. No registry/gateway/deployment/runtime/governance/Action owner changes. Application metadata is consumed from the canonical package and serialization composes `serializeViraApplicationPackage()`. Public API remains parse/serialize/integrity verification only.

## Local Q7 history

First exact-head run on `41fa04d7af4c5a68fa4eff1cb4a2403bff4dbaac`:

- `pnpm check:boundaries` PASS;
- focused `application-distribution` tests 13/13 PASS;
- `pnpm typecheck` failed with one test-only TS7006 implicit-any verifier callback parameter.

The correction changed only the focused test by annotating the callback with exported `ViraApplicationDistributionVerifierInput`; production implementation stayed unchanged. Corrected frozen executable head: `ad9745334e0cedfe2b7d28ee06435f498e62e7c4`.

Corrected exact-head local Q7 is operator-reported GREEN:

- `pnpm check:boundaries` PASS;
- `pnpm typecheck` PASS;
- `pnpm vitest run tests/contract/application-distribution.test.ts` PASS.

Evidence: `docs/evidence/MASTER-37/VERIFICATION.md`.

## Q0–Q9

- Q0 PASS — exact authoritative base.
- Q1 PASS — targeted RE.
- Q2 PASS — distribution ownership/invariants frozen.
- Q3 PASS — package implementation.
- Q4 PASS — focused contract/integrity/security coverage.
- Q5 PASS — security/fail-closed review.
- Q6 PASS — architecture/ownership review.
- Q7 PASS — corrected exact-head local gate.
- Q8 FINAL REQUIRED — compare corrected frozen executable head to final PR head; only docs/evidence/status may differ.
- Q9 BLOCKED until final Q8; then exact-head squash merge and MASTER-38 starts from resulting new authoritative `main`.

Hosted verify/iOS/Android jobs remain zero-step / runner-id-0 infrastructure non-signal.
