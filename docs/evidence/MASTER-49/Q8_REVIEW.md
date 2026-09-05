# MASTER-49 — Independent Q8 PR Reverse Engineering

**Date:** 2026-09-05  
**PR:** #210  
**Base:** `70dfa599b6b7e77bb5a70e53cee56dd22c0a0b05`  
**Frozen executable/test SHA:** `5bb3497b736095509ba4b13d365d52ddee4b60bc`  
**Q7:** operator-reported PASS on the exact frozen SHA  
**Q8 result:** PASS

## Independent review scope

Q8 restarted from current PR metadata and changed-file inventory rather than relying on the pre-Q7 implementation narrative.

Reviewed independently:

- `packages/application-ai-host-sdk/src/evaluate.ts`
- `packages/application-ai-host-sdk/src/types.ts`
- `packages/application-ai-host-sdk/src/index.ts`
- `packages/application-ai-host-sdk/package.json`
- `packages/application-package/src/reference.ts`
- `packages/application-package/src/index.ts`
- `packages/application-distribution/src/validate.ts`
- `packages/application-distribution/src/index.ts`
- `packages/application-publisher-sdk/src/index.ts`
- `examples/external-ai-host-proof/package.json`
- `examples/external-ai-host-proof/external-ai-host-proof.test.ts`
- `tests/contract/application-ai-host-exact-reference-owner.test.ts`
- existing AI-host contract and hardening suites
- root proof script
- `tooling/package-boundaries.config.mjs`
- `PACKAGE_OWNERSHIP.md`
- PR reviews, review threads and conversation comments
- current-head hosted Actions
- frozen-to-current branch drift

## Findings

### Canonical owner alignment — PASS

- `application-package` remains the canonical exact Application-reference owner.
- AI-host protocol projection references delegate to `parseViraApplicationExactReference()` instead of carrying a second version-ref/floating-alias parser.
- Owner errors are mapped only into AI-host-specific issue code/path presentation; the underlying reference acceptance semantics remain canonical.
- Host `viraVersion` remains an AI-host runtime-compatibility input and is not confused with Application release identity.

### Distribution integrity boundary — PASS

- AI-host evaluation delegates source parsing and integrity verification to canonical `application-distribution`.
- The canonical Distribution verifier receives `{ algorithm, digest, canonicalArtifact }` where `canonicalArtifact` is canonical Application serialization.
- Verifier absence fails closed.
- Verifier exceptions fail closed.
- Only literal boolean `true` is accepted as integrity verification success.
- A digest declaration by itself does not become verification truth.

### Independent external consumer proof — PASS

- `@acme/vira-external-ai-host-proof` is a separately named workspace consumer.
- It depends on public package roots only: Publisher SDK, Distribution and AI-host SDK.
- The proof imports no Vira `src/*` internal paths.
- It computes SHA-256 externally with Node crypto over the canonical artifact supplied by the public Distribution verifier contract.
- A tampered digest is rejected.
- An explicit verifier is required.

### Compatibility semantics — PASS

- Host descriptor is exact-shape validated before integrity-verifier invocation.
- Host capability and protocol-projection collections are bounded.
- Duplicate capabilities/projections fail closed.
- Unsafe accessor/custom-prototype input fails closed through shared safe JSON parsing before verifier invocation.
- Required host capabilities are exact identifiers; missing requirements fail closed.
- `minViraVersion` / optional `maxViraVersion` compatibility is enforced.
- Protocol projection compatibility is exact `id + versionRef` intersection only.
- Same-id/different-version support does not substitute.
- Floating aliases/ranges are rejected by the canonical exact-reference owner.
- An empty projection intersection may still be a valid host compatibility result; projection egress compatibility is not conflated with source/runtime compatibility.

### Authority leakage — PASS

The AI-host compatibility plan contains source, host descriptor and compatible projection references only. It does not acquire or expose:

- host authentication/attestation,
- authorization/governance permission,
- commercial entitlement,
- deployment permission,
- runtime execution authority,
- protected Action authority,
- transport/endpoints,
- credentials/secrets,
- protocol execution artifacts.

Ownership documentation and executable boundary policy remain aligned: `application-ai-host-sdk` is a thin integration layer over canonical Distribution/Application owners and may depend only on `application-distribution`, `application-package` and `protocol`.

### PR discussion surface — PASS

At Q8 review time:

- submitted reviews: none;
- inline review threads: none;
- PR conversation comments: none.

There are therefore no unresolved human-review findings hidden outside the code diff.

### Hosted Actions classification

The current-head `ci` workflow is reported as failure, but its three jobs (`verify`, `android-native`, `ios-native`) have empty `steps` arrays and `runner_id: 0`. No workflow step executed. Under the repository verification discipline this is runner/infrastructure non-signal, not evidence of a code-test failure.

### Frozen-to-current drift — PASS

Comparison from frozen executable/test SHA `5bb3497b736095509ba4b13d365d52ddee4b60bc` to the Q8 current branch state shows only phase-plan/evidence documentation changes. Executable source, package manifests, tests and boundary configuration have zero post-freeze drift.

## Q8 conclusion

**PASS.** No executable remediation is required, the Q7 freeze remains valid, and MASTER-49 may proceed to the final Q9 frozen-to-closure / exact-head merge gate.
