# MASTER-25R Verification

## Scope

MASTER-25R closes Enterprise GenUI RC evidence against the exact post-CLEAN-00 tree without introducing new runtime, SDK, governance, Action Boundary or customer-specific authority.

## Baseline

- authoritative `main`: `9d451b809e14538edcf2c0ed2d913de8fc724377`
- phase branch: `master/25r-enterprise-rc-closure`
- canonical executable gate: `pnpm verify:enterprise-rc`

## Existing release contract review

### RC composition

Source inspection confirms `tooling/verify-enterprise-rc.mjs` runs, fail-fast and in order:

```text
verify:all
check:studio-native
verify:ios-simulator
verify:android-emulator
verify:external-brand-proof
```

Enterprise RC PASS is emitted only after every stage returns success.

### External evidence boundary

Source inspection confirms the generic verifier fails closed for missing/unreadable evidence, non-exact object shapes, wrong evidence version, invalid HEAD/Pack/digest/reference forms, missing or failed Web/iOS/Android records, missing/false required gate records and a `viraHead` different from `git rev-parse HEAD`.

No Pegasus/customer identity is embedded in the generic verifier.

## Q4 regression-gap finding

A second-pass test-tree audit found no focused contract test for either release script. The broader suite covers underlying runtime/governance/native contracts, but did not directly protect the release orchestration/evidence boundary from regression.

Added:

```text
tests/contract/enterprise-rc-gate.test.ts
```

The black-box tests cover:

- exact valid evidence → success;
- missing evidence → fail closed;
- malformed JSON → fail closed;
- stale `viraHead` → fail closed;
- omitted required gate → fail closed;
- failed iOS platform record → fail closed;
- canonical five-stage RC order;
- first-stage failure propagation/short circuit;
- no PASS message after failure.

A separate behavioral sanity harness using the same `.mjs` boundaries confirmed valid exact-head evidence acceptance, canonical five-stage order and synthetic iOS failure exit/no-PASS behavior. That run used the available analysis environment and is **not** repository Q7 evidence.

The new Vitest contract file is included by the repository `tests/**/*.ts` TypeScript/test surface. Canonical execution still must occur through the repository's Node >=24 `pnpm` gate.

## Security/architecture review

Current implementation review remains clean:

- no implicit latest release identity;
- no stale-head acceptance;
- no missing-platform acceptance;
- no omitted-negative-gate acceptance;
- no provider/customer bypass;
- no second RC authority;
- no production/tooling behavior modification;
- no dependency edge added.

## Current PR scope

Current base-to-branch compare contains release plan/evidence/status documents plus one focused contract-test file. There are no changes under `packages/`, `sdk/`, `.github/`, dependency manifests or release tooling implementation.

Because executable test coverage was added after the original pre-Q7 review, the earlier frozen SHA `27845ef...` is obsolete and must not be used for external proof.

## Q7 required exact-tree gate

Still blocked on external proof and exact local repository execution.

Required final command after the new pre-Q7 head is frozen:

```bash
VIRA_EXTERNAL_BRAND_PROOF_EVIDENCE=/absolute/path/to/external-brand-proof.json pnpm verify:enterprise-rc
```

The evidence `viraHead` must equal that newly frozen exact checkout SHA.

## Hosted CI

Hosted GitHub Actions continues to exhibit the pre-existing zero-step/no-runner allocation failure. It is not counted as PASS.

## Gate status

- Q0 baseline: PASS
- Q1 reverse engineering: PASS
- Q2 authority freeze: PASS
- Q3 minimal implementation: PASS — plan/evidence + one focused contract-test file
- Q4 focused verification: **TEST COVERAGE ADDED / CANONICAL REPOSITORY EXECUTION PENDING**
- Q5 security review: PASS by source/diff review
- Q6 architecture review: PASS — release owners unchanged
- Q7 exact Enterprise RC execution: **BLOCKED / NOT EXECUTED**
- Q8 independent PR reverse engineering: **REQUIRED AGAIN AFTER TEST ADDITION**
- Q9 merge/post-merge: NOT STARTED

## Merge decision

# NOT READY TO MERGE

Do not declare Enterprise GenUI RC1 and do not start MASTER-26 until the updated PR passes independent Q8, the new exact pre-Q7 head is frozen, exact-head external proof exists, `pnpm verify:enterprise-rc` passes, and the final post-Q7 evidence-only compare is clean.
