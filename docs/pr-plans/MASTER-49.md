# MASTER-49 — Independent External AI Host Proof

**Status:** Q0–Q9 PASS / MERGE READY  
**Base SHA:** `70dfa599b6b7e77bb5a70e53cee56dd22c0a0b05`  
**Frozen executable/test SHA:** `5bb3497b736095509ba4b13d365d52ddee4b60bc`  
**Branch:** `master/49-external-ai-host-proof`  
**PR:** #210

## Goal

Prove that an independently named AI host can consume Vira public SDK contracts, explicitly verify a canonical Distribution artifact, and evaluate host compatibility without private source imports or acquiring hidden security/runtime authority.

## Q0–Q1 — repository truth

- `application-distribution` owns the canonical Distribution envelope and integrity-verifier contract.
- `application-ai-host-sdk` already owns host compatibility composition.
- `application-package` owns canonical exact-reference syntax used by protocol projections.
- The Application Network thesis explicitly requires independent external AI-host proof.
- Therefore MASTER-49 adds proof and owner alignment, not a new host/runtime/protocol owner.

Q1 found one prerequisite owner drift: AI-host host projection parsing locally duplicated exact-reference regex/floating-alias semantics. MASTER-49 delegates those semantics to `parseViraApplicationExactReference()` while preserving AI-host-specific error paths/codes.

## Q2 — contract freeze

```text
independent @acme host
        ↓ public package roots
Publisher SDK → canonical Distribution envelope
        ↓
external SHA-256 integrity verifier
        ↓
application-ai-host-sdk
        ↓
Vira-version + required capability compatibility
        + exact protocol projection intersection
```

Required invariants:

- no private Vira `src/*` imports from the external proof consumer;
- declared Distribution digest is not accepted as verified without an explicit verifier;
- tampered digest fails closed;
- host descriptor validation happens before verifier invocation;
- host protocol projection references use canonical Application exact-reference semantics;
- required host capability and Vira-version mismatch fail closed;
- protocol projection intersection is exact id + exact versionRef only;
- no latest/floating projection support, version substitution or fallback;
- compatibility success is not authorization, entitlement, deployment, execution or host authentication.

## Q3 — implementation

- delegated AI-host host projection reference parsing to canonical `application-package` exact-reference API;
- added `examples/external-ai-host-proof` as independent `@acme/...` workspace consumer;
- external proof uses public Publisher SDK, Distribution verifier type and AI-host SDK package roots only;
- external proof computes/verifies SHA-256 outside Vira against canonical artifact input;
- added root `verify:external-ai-host-proof` gate.

## Q4 — focused/hardening tests

- `examples/external-ai-host-proof/external-ai-host-proof.test.ts`
- `tests/contract/application-ai-host-exact-reference-owner.test.ts`
- existing `application-ai-host-sdk.test.ts`
- existing `application-ai-host-sdk-hardening.test.ts`

Coverage includes real external artifact verification, tampered digest rejection, missing verifier, exact-reference owner parity, verifier-before-host-validation ordering, Vira-version/capability mismatch and exact protocol projection compatibility.

## Q5–Q6

Static security/architecture review PASS: `docs/evidence/MASTER-49/Q5_Q6_REVIEW.md`.

## Q7

Operator-reported PASS on exact freeze `5bb3497b736095509ba4b13d365d52ddee4b60bc`. Evidence: `docs/evidence/MASTER-49/Q7_LOCAL_PASS.md`.

No test counts, warning counts, durations or timings were reconstructed or inferred.

## Q8

Independent PR reverse engineering PASS: `docs/evidence/MASTER-49/Q8_REVIEW.md`.

Q8 independently re-read the executable owner chain, public proof consumer, existing hardening tests, package boundaries, ownership authority, reviews/threads/comments, hosted Actions and frozen-to-current drift. No executable remediation was required; the Q7 freeze remains valid.

## Q9

Closure gate PASS: `docs/evidence/MASTER-49/Q9_CLOSURE_GATE.md`.

Frozen executable/test SHA to reviewed closure state contains documentation/evidence changes only. No executable/package/test/boundary drift occurred after Q7. PR #210 is eligible for draft→ready transition, a fresh exact-head read, and squash merge guarded by `expected_head_sha`.
