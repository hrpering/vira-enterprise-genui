# MASTER-25R Verification

## Scope

MASTER-25R closes Enterprise GenUI RC evidence against the exact post-CLEAN-00 tree without introducing new runtime, SDK, governance, Action Boundary or customer-specific authority.

## Baseline

- authoritative `main`: `9d451b809e14538edcf2c0ed2d913de8fc724377`
- phase branch: `master/25r-enterprise-rc-closure`
- canonical executable gate: `pnpm verify:enterprise-rc`

## Existing release contract review

`tooling/verify-enterprise-rc.mjs` remains the canonical fail-fast composition:

```text
verify:all
check:studio-native
verify:ios-simulator
verify:android-emulator
verify:external-brand-proof
```

Enterprise RC PASS is emitted only after every stage returns success.

`tooling/verify-external-brand-proof-evidence.mjs` remains generic and fails closed for missing/unreadable evidence, non-exact shapes, invalid version/HEAD/Pack/digest/reference values, missing or failed Web/iOS/Android records, missing/false required gates and `viraHead` mismatch with `git rev-parse HEAD`.

## Q4 regression-gap closure

Second-pass reverse engineering found no focused regression test for the two release scripts. Added:

```text
tests/contract/enterprise-rc-gate.test.ts
```

Black-box coverage now includes:

- exact valid evidence → success;
- missing evidence → fail closed;
- malformed JSON → fail closed;
- stale `viraHead` → fail closed;
- omitted required gate → fail closed;
- failed platform proof → fail closed;
- canonical five-stage RC order;
- first-failure propagation/short circuit;
- no PASS message after failure.

A separate behavioral sanity harness using the same existing `.mjs` boundaries confirmed valid exact-head evidence acceptance, canonical five-stage order and synthetic iOS failure exit/no-PASS behavior. That sanity run is **not** repository Q7 evidence.

The Vitest file is inside the repository `tests/**/*.ts` TypeScript/test surface. Canonical test execution still requires the repository Node >=24 environment.

## Q5/Q6 review

PASS by source/diff review:

- no implicit latest;
- no stale-head acceptance;
- no missing-platform/gate acceptance;
- no provider/customer bypass;
- no second RC authority;
- no production/runtime/SDK/tooling behavior modification;
- no dependency edge added.

## Q8 independent PR reverse engineering

PASS after the focused test addition.

Review target: PR #185 at post-test head `df29817e93be873873937e695c0a9b01f06a0824`.

The reviewed diff contains release plan/status/evidence plus one black-box contract test. It contains no `packages/`, `sdk/`, `.github/`, dependency-manifest or release-tooling implementation change. See `PR_REVIEW.md`.

The earlier frozen SHA `27845ef...` is obsolete and must not be used for external proof.

After this Q8 evidence overlay, a final compare from the reviewed executable tree must show documentation/evidence-only changes before the new pre-Q7 head is frozen.

## Q7 required exact-tree gate

Still blocked on canonical repository execution plus external exact-head proof.

After the new head is frozen:

```bash
VIRA_EXTERNAL_BRAND_PROOF_EVIDENCE=/absolute/path/to/external-brand-proof.json pnpm verify:enterprise-rc
```

The evidence `viraHead` must equal that exact checkout SHA.

## Hosted CI

Hosted GitHub Actions continues to exhibit the pre-existing zero-step/no-runner allocation failure. It is not counted as PASS.

## Gate status

- Q0 baseline: PASS
- Q1 reverse engineering: PASS
- Q2 authority freeze: PASS
- Q3 minimal implementation: PASS — release evidence/status + one focused contract test
- Q4 focused verification: **COVERAGE IMPLEMENTED / CANONICAL NODE>=24 REPOSITORY EXECUTION PENDING**
- Q5 security review: PASS
- Q6 architecture review: PASS
- Q7 exact Enterprise RC execution: **BLOCKED / NOT EXECUTED**
- Q8 independent PR reverse engineering: **PASS — POST-TEST / PRE-Q7**
- Q9 merge/post-merge: NOT STARTED

## Merge decision

# NOT READY TO MERGE

Do not declare Enterprise GenUI RC1 and do not start MASTER-26 until the final evidence-only compare is clean, the new exact pre-Q7 head is frozen, exact-head external proof exists, `pnpm verify:enterprise-rc` passes, and the final post-Q7 evidence-only compare remains clean.
