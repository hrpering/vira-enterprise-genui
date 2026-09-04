# MASTER-25R Verification

## Scope

MASTER-25R closes Enterprise GenUI RC evidence against the exact post-CLEAN-00 tree without introducing new runtime, SDK, governance, Action Boundary or customer-specific authority.

## Baseline

- authoritative `main`: `9d451b809e14538edcf2c0ed2d913de8fc724377`
- phase branch: `master/25r-enterprise-rc-closure`
- frozen executable head used for Q7: `740e8928237d40078b84ebf80ee543104063f6fd`
- frozen executable tree: `0ca0b35bf27dd4a312598078e67c4d37bdce54d1`
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

Black-box coverage includes:

- exact valid evidence → success;
- missing evidence → fail closed;
- malformed JSON → fail closed;
- stale `viraHead` → fail closed;
- omitted required gate → fail closed;
- failed platform proof → fail closed;
- canonical five-stage RC order;
- first-failure propagation/short circuit;
- no PASS message after failure.

The canonical repository execution on the frozen exact head passed locally under Node 26.5.1. The run reported 186 Vitest files / 940 tests passing, production build passing, and Playwright browser verification passing before the native/release stages.

## External proof

The external airline/Pegasus proof is owned by `hrpering/vira-enterprise-demo`, outside generic Vira core.

- external proof PR: `hrpering/vira-enterprise-demo#1`
- exact Vira dependency under proof: `740e8928237d40078b84ebf80ee543104063f6fd`
- exact Vira tree under proof: `0ca0b35bf27dd4a312598078e67c4d37bdce54d1`
- external proof source squash merge: `d36b5f1e6a7c6987f6508e0f03c53a2b8e1c586c`

The operator reported the complete external proof chain green on the exact frozen Vira checkout: contract proof, real Chromium, iOS Simulator, Android Emulator and final fail-closed evidence generation. Generated evidence remained local/gitignored and was consumed by the core RC gate through `VIRA_EXTERNAL_BRAND_PROOF_EVIDENCE`.

## Q5/Q6 review

PASS by source/diff review:

- no implicit latest;
- no stale-head acceptance;
- no missing-platform/gate acceptance;
- no provider/customer bypass;
- no second RC authority;
- no production/runtime/SDK/tooling behavior modification after the executable freeze;
- no dependency edge added.

## Q7 exact-tree release gate

# PASS — OPERATOR-REPORTED EXACT-HEAD EXECUTION

The operator reported the following canonical command green on the exact frozen checkout:

```bash
VIRA_EXTERNAL_BRAND_PROOF_EVIDENCE=/Users/esadturkel/vira-enterprise-demo/evidence/external-brand-proof.json \
pnpm verify:enterprise-rc
```

The execution target was exactly:

```text
740e8928237d40078b84ebf80ee543104063f6fd
```

This means the canonical fail-fast chain completed successfully across repository/browser verification, portable native conformance, iOS Simulator, Android Emulator and external-brand proof verification on the frozen executable content.

## Hosted CI

Hosted GitHub Actions continues to exhibit the pre-existing zero-step/no-runner allocation failure. It is not counted as PASS. The release decision is based on the exact-head local execution above, not on a false hosted-CI green claim.

## Gate status

- Q0 baseline: PASS
- Q1 reverse engineering: PASS
- Q2 authority freeze: PASS
- Q3 minimal implementation: PASS — release evidence/status + one focused contract test
- Q4 focused verification: PASS — canonical local execution completed
- Q5 security review: PASS
- Q6 architecture review: PASS
- Q7 exact Enterprise RC execution: **PASS — operator-reported exact frozen head**
- Q8 independent PR reverse engineering: final post-Q7 evidence-only compare required before merge
- Q9 merge/post-merge: NOT STARTED

## Merge decision

Q7 is green. Only documentation/evidence closure commits are permitted after the frozen executable head. Before squash merge, final Q8 must compare `740e8928237d40078b84ebf80ee543104063f6fd` with the closure head and prove that no executable content changed after the green run.
