# MASTER-37 — Application Distribution Contract

## Goal

Establish the first canonical Vira Network distribution boundary: distribute one exact canonical `ViraApplicationPackage` release with explicit artifact-integrity identity, without creating a second Application schema, registry, transport, provider binding, deployment path or execution authority.

## Base

- authoritative `main`: `2e1b509ca9d7c0c1c0179746bec95fa7f2bed016`
- previous phase: MASTER-36 merged via PR #196
- branch: `master/37-distribution-contract`
- corrected frozen executable head: `ad9745334e0cedfe2b7d28ee06435f498e62e7c4`

## Ownership

Existing owners remain canonical. `application-package` owns Application identity/version, distribution metadata, compatibility and exact protocol projection references. Existing Experience/private registries, protocol gateway, deployment plane, runtime, governance and Action owners retain their current authority.

`@vira-enterprise-genui/application-distribution` owns only strict distribution-envelope shape, canonical Application embedding by delegation, exact SHA-256 artifact-integrity identity, deterministic envelope serialization around canonical Application serialization, and fail-closed integrity verification through an injected verifier.

It does not own registry/search/ranking, implicit latest, transport/federation/provider/credential semantics, deployment/runtime state, entitlement/authorization/governance, Capability/Action execution, or digest provider implementation.

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

Parsing validates the declared integrity identity but does not claim verification. `verifyViraApplicationDistributionIntegrity()` verifies against canonical `serializeViraApplicationPackage(application)` using an injected verifier.

## Package boundary

```text
application-distribution → application-package, protocol
```

## Reviews

Q5 security review PASS: shared safe JSON boundary, exact root/integrity shapes, canonical Application delegation, strict SHA-256 identity, explicit verification, fail-closed verifier handling, prototype/accessor hardening and authority-smuggling rejection.

Q6 architecture review PASS: only `application-package` and `protocol` executable dependencies; no competing registry/gateway/deployment/runtime/governance/Action authority; no duplicate Application metadata schema; canonical serialization reused.

## Local Q7 history

First exact-head run on `41fa04d7af4c5a68fa4eff1cb4a2403bff4dbaac` passed package boundaries and 13/13 focused tests but failed TypeScript on one test-only TS7006 implicit-any verifier callback. Production implementation did not change. The test was annotated with exported `ViraApplicationDistributionVerifierInput`, creating corrected frozen executable head `ad9745334e0cedfe2b7d28ee06435f498e62e7c4`.

Corrected exact-head local Q7 is operator-reported GREEN:

- `pnpm check:boundaries` PASS;
- `pnpm typecheck` PASS;
- `pnpm vitest run tests/contract/application-distribution.test.ts` PASS.

Evidence: `docs/evidence/MASTER-37/VERIFICATION.md`.

## Final Q8

PASS. Compare from corrected frozen executable head `ad9745334e0cedfe2b7d28ee06435f498e62e7c4` to closure branch state contains only:

- `docs/evidence/MASTER-37/VERIFICATION.md`
- `docs/pr-plans/ACTIVE_PHASE.md`
- `docs/pr-plans/MASTER-37.md`

No executable drift exists after the verified head.

## Q0–Q9

- Q0 PASS
- Q1 PASS
- Q2 PASS
- Q3 PASS
- Q4 PASS
- Q5 PASS
- Q6 PASS
- Q7 PASS
- Q8 PASS
- Q9 READY — exact-head squash merge; then MASTER-38 starts from resulting authoritative `main`.

Hosted verify/iOS/Android jobs remain zero-step / runner-id-0 infrastructure non-signal.
