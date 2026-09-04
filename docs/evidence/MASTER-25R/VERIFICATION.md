# MASTER-25R Verification

## Scope

MASTER-25R closes Enterprise GenUI RC evidence against the exact post-CLEAN-00 tree. It must not introduce new runtime, SDK, governance, Action Boundary or customer-specific implementation authority.

## Baseline

- authoritative `main`: `9d451b809e14538edcf2c0ed2d913de8fc724377`
- phase branch: `master/25r-enterprise-rc-closure`
- canonical executable gate: `pnpm verify:enterprise-rc`

## Static Q4/Q5/Q6 review

### RC composition

PASS by source inspection:

- `tooling/verify-enterprise-rc.mjs` runs repository/browser verification first;
- then portable native conformance;
- then real iOS Simulator gate;
- then real Android Emulator gate;
- then external-brand evidence verification;
- any command start/non-zero failure exits before PASS;
- Enterprise RC PASS is printed only after all five stages succeed.

### External evidence fail-closed properties

PASS by source inspection:

- evidence path is mandatory via `VIRA_EXTERNAL_BRAND_PROOF_EVIDENCE`;
- JSON parsing/read failure throws;
- root object has exact allowed keys;
- evidence version is exact;
- `viraHead` must be a 40-character lowercase hex SHA;
- Pack id/version/digest shapes are validated;
- platform object must contain exactly Web/iOS/Android;
- every platform must have `passed === true` and a valid trace reference;
- gate object must contain exactly the complete required gate set;
- every required gate must be exactly `true`;
- current checkout is obtained with `git rev-parse HEAD`;
- evidence targeting another HEAD throws.

### Security/architecture

PASS by source inspection:

- external provider/proof cannot override core structural checks;
- no implicit latest release identity;
- no stale-head acceptance;
- no missing-platform acceptance;
- no omitted-negative-gate acceptance;
- no customer/domain-specific identity is embedded in the generic verifier;
- no second RC authority is required;
- no package dependency edge is justified.

## Current repository diff expectation

Before Q7, the phase remains documentation/evidence-only:

```text
MASTER_PLAN.md
docs/pr-plans/MASTER-25R.md
docs/pr-plans/ACTIVE_PHASE.md
docs/pr-plans/README.md
docs/evidence/MASTER-25R/RE_REPORT.md
docs/evidence/MASTER-25R/VERIFICATION.md
docs/evidence/MASTER-25R/PR_REVIEW.md
```

Any executable change discovered in a later compare requires renewed Q4–Q7 verification.

## Pre-Q7 Q8 review

PASS.

Independent review of PR #185 at pre-Q7 head `52bc8e3af6567bb769146818d6f167004a048723` found only release plan/status/evidence changes and no package/runtime/SDK/tooling/workflow/test/manifest implementation change. See `PR_REVIEW.md`.

The Q8 evidence documents added after that review are themselves non-executable; a final compare must confirm this before the branch is frozen for Q7.

## Q7 required exact executable-tree gate

NOT YET EXECUTED / BLOCKED ON EXTERNAL EXACT-HEAD PROOF.

Required command:

```bash
VIRA_EXTERNAL_BRAND_PROOF_EVIDENCE=/absolute/path/to/external-brand-proof.json pnpm verify:enterprise-rc
```

The evidence `viraHead` must equal the exact checkout SHA on which this command runs.

The release command itself covers:

```text
pnpm verify:all
pnpm check:studio-native
pnpm verify:ios-simulator
pnpm verify:android-emulator
pnpm verify:external-brand-proof
```

## Hosted CI

Hosted GitHub Actions previously exhibited a pre-existing zero-step/no-runner allocation failure during CLEAN-00. That infrastructure state is not treated as release evidence and cannot substitute for the exact local RC gate.

## Gate status

- Q0 baseline: PASS
- Q1 reverse engineering: PASS
- Q2 authority freeze: PASS
- Q3 minimal implementation: PASS so far — documentation/evidence only
- Q4 focused static verification: PASS for existing release verifier semantics
- Q5 security review: PASS for existing release verifier semantics
- Q6 architecture review: PASS — no duplicate release/runtime owner introduced
- Q7 exact Enterprise RC execution: **BLOCKED / NOT EXECUTED**
- Q8 independent PR reverse engineering: **PASS — PRE-Q7**
- Q9 merge/post-merge: NOT STARTED

## Merge decision

# NOT READY TO MERGE

Do not declare Enterprise GenUI RC1 and do not start MASTER-26 until exact-head external proof exists, `pnpm verify:enterprise-rc` passes, and the final post-Q7 evidence-only compare completes.
