# MASTER-25R — Enterprise RC Evidence Closure

## Q0 — Baseline

- Repository: `hrpering/vira-enterprise-genui`
- Authoritative post-CLEAN-00 `main`: `9d451b809e14538edcf2c0ed2d913de8fc724377`
- CLEAN-00: merged via PR #184
- Open PRs at phase start: 0
- MASTER-25 implementation: already in `main`
- RC1 declaration: not yet allowed

## Responsibility

MASTER-25R closes release evidence against the exact post-CLEAN-00 stack. It does not redesign runtime, native SDKs, Action Boundary, governance, Studio contracts or the external proof application.

## OWNS

- exact release-head evidence binding;
- post-CLEAN-00 RC status/evidence records;
- execution of the existing canonical Enterprise RC command;
- final RC declaration only after all exact-head gates pass.

## DOES NOT OWN

- Experience schema;
- native Host SDK semantics;
- Action Boundary semantics;
- governance semantics;
- external brand/domain application logic;
- Pegasus-specific code in generic core;
- replacement release scripts or a second RC authority.

## CONSUMES

- root `verify:enterprise-rc` script;
- `verify:all` repository/browser gate;
- portable native conformance;
- real iOS Simulator gate;
- real Android Emulator gate;
- generic external-brand proof evidence verifier;
- external Pegasus proof evidence produced outside generic core.

## INVARIANTS

1. `pnpm verify:enterprise-rc` remains the only command allowed to print Enterprise RC PASS.
2. External proof evidence must target the exact current Git HEAD.
3. One exact Pack id/version/digest is preserved across Web/iOS/Android proof records.
4. Simulator/emulator execution cannot be replaced by host-only tests.
5. Missing external evidence fails closed.
6. Stale evidence from a pre-CLEAN or pre-evidence head fails closed.
7. Generic core gains no Pegasus/customer-specific branch.
8. Evidence/documentation changes after a green executable tree require final exact-head diff review before merge.
9. MASTER-26 may not start until MASTER-25R merges and RC1 is truthfully declared.

## FAILURE MODEL

MASTER-25R is blocked by any of:

- repository/browser gate failure;
- native conformance failure;
- missing/invalid iOS Simulator execution;
- missing/invalid Android Emulator execution;
- missing external proof evidence;
- wrong evidence shape;
- false platform/gate value;
- wrong Pack digest/version/identity;
- evidence `viraHead` mismatch;
- external proof that cannot demonstrate required negative/security cases.

No failure is converted into PASS by documentation.

## VERSION MODEL

Release identity is the exact 40-character Git SHA of the executable Vira checkout plus the exact external Pack identity/version/digest carried by evidence. No implicit latest is permitted.

## BACKWARD COMPATIBILITY

No runtime/public API compatibility change is intended. MASTER-25R consumes the already-implemented MASTER-25 release interface.

## ALLOWED DEPENDENCY EDGES

None. This phase should not add package dependencies.

## Q1 — Reverse-engineering findings

1. `package.json` already exposes `verify:external-brand-proof` and `verify:enterprise-rc`.
2. `tooling/verify-enterprise-rc.mjs` executes, in order: repository/browser, native conformance, iOS Simulator, Android Emulator and external brand evidence.
3. `tooling/verify-external-brand-proof-evidence.mjs` validates an exact evidence object and compares `evidence.viraHead` with `git rev-parse HEAD`.
4. The external verifier requires Web/iOS/Android pass records and the complete required security/negative gate set.
5. `docs/pr-plans/ACTIVE_PHASE.md` became stale immediately after CLEAN-00 merge and still describes CLEAN-00 as unmerged/Q7-blocked.
6. `MASTER_PLAN.md` likewise still labels CLEAN-00 active and MASTER-25R next; those status labels must be reconciled as phase bookkeeping, not as new product semantics.
7. No separate Pegasus proof repository is visible through the connected GitHub account. External evidence therefore remains an external/local prerequisite and must not be fabricated in core.

## Q2 — Authority freeze

Canonical RC executable owner remains the existing root/tooling release gate. MASTER-25R adds no competing release path.

## Q3 — Minimal implementation

Expected repository diff before final evidence overlay:

- add this MASTER-25R plan;
- update active-phase/release status documentation;
- add MASTER-25R reverse-engineering and verification evidence;
- no package/runtime/SDK/tooling behavior changes unless independent review discovers a concrete defect.

## Q4/Q5/Q6 focus

Verification/review must explicitly prove:

- exact-head mismatch fails closed;
- missing evidence fails closed;
- no platform gate can be omitted;
- no required negative/security gate can be omitted;
- no customer-specific identity leaks into generic release APIs;
- no second RC authority is introduced;
- no executable dependency graph changes.

## Q7 — Release gate

Run on the exact executable MASTER-25R tree before evidence-only closure commits:

```bash
VIRA_EXTERNAL_BRAND_PROOF_EVIDENCE=/absolute/path/to/external-brand-proof.json pnpm verify:enterprise-rc
```

The supplied evidence JSON must have `viraHead` equal to the exact checkout SHA used for the command.

## Q8 — Independent PR reverse engineering

Before merge inspect actual PR diff for scope creep, duplicate authority, hidden fallback, customer leakage and evidence that targets another head.

## Q9 — Merge/post-merge

Only after exact-head gates and final evidence-only Q8:

```text
MASTER-25R PR head
  ↓
squash merge
  ↓
new authoritative main SHA
  ↓
Enterprise GenUI RC1 declaration
  ↓
MASTER-26 starts from that exact main
```
