# MASTER-50 — Independent External Provider Proof

**Status:** Q0–Q9 PASS / MERGE READY  
**Base SHA:** `46f4d8ec163790765d162d13747dd4f64bf0e8ea`  
**Frozen executable/test SHA:** `5ed6832fa9f233b0b7eb44a8fc5f10f143d00905`  
**Branch:** `master/50-external-provider-proof`  
**PR:** #211 (ready transition / exact-head merge pending)

## Goal

Prove that an independently named provider can compose Vira's public Capability contract, supply discovery and hosted query runtime without private source imports, hidden provider trust, fallback semantics or new cloud/runtime authority.

## Q0–Q1

Repository truth identified `capability-contract`, `capability-supply` and `hosted-capability-runtime` as the existing canonical owners. Q1 also found exact Capability reference parsing duplicated downstream because the canonical type owner lacked a public owner-local parser. MASTER-50 moved that parsing surface into `capability-contract` and delegated consumers to it.

## Q2 contract

- canonical exact references stay in `capability-contract`;
- external proof uses public package roots only;
- supply is exact discovery only and never invokes providers;
- exact miss is empty success, never latest/fallback/substitution/ranking;
- provider/source/binding/location identities are provenance/routing only;
- hosted execution verifies exact binding identity and rejects actions before adapter invocation;
- adapter is one-shot, with exact typed output and no retry/failover;
- execution evidence cannot acquire auth/trust/commercial/deployment/cloud authority.

## Q3 implementation

- exposed `parseViraCapabilityExactReference()` / `serializeViraCapabilityExactReference()` from `capability-contract`;
- delegated CapabilityDefinition nested refs and hosted refs to that owner;
- added `@acme/vira-external-provider-proof` using public package roots;
- added root `verify:external-provider-proof`.

## Q4 tests

New focused surfaces:

- `tests/contract/capability-exact-reference-owner.test.ts`;
- `examples/external-provider-proof/external-provider-proof.test.ts`.

Existing Capability, hosted runtime and supply regression/hardening suites were included in the operator Q7 gate.

## Q5–Q6

PASS: `docs/evidence/MASTER-50/Q5_Q6_REVIEW.md`.

## Q7

Operator-reported PASS on exact frozen SHA `5ed6832fa9f233b0b7eb44a8fc5f10f143d00905`: `docs/evidence/MASTER-50/Q7_LOCAL_PASS.md`.

No counts/timings/warning counts were reconstructed.

## Q8

Independent reverse-engineering PASS: `docs/evidence/MASTER-50/Q8_REVIEW.md`.

The review independently re-read PR metadata/diff, canonical owners, final executable code/tests, reviews/threads/comments, hosted CI and freeze drift. No executable/security/ownership blocker was found. Hosted failures were infrastructure non-signal because failed jobs exposed `steps = null`.

## Q9

PASS: `docs/evidence/MASTER-50/Q9_CLOSURE_GATE.md`.

Frozen executable/test SHA → closure comparison contained only documentation/evidence changes. Executable/package/test/boundary drift remained zero.

## Merge gate

PR #211 may now move draft→ready. Re-read its exact current head and squash merge only with `expected_head_sha`. Any executable/package/test/boundary change before merge invalidates Q7/Q9 and requires a new freeze + operator rerun.
