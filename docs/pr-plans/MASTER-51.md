# MASTER-51 — Cross-Surface Exact Semantics + Application Network RC

**Status:** Q0–Q7 PASS / Q8 ACTIVE  
**Base SHA:** `6f02e4437210c0cd662f1852759c88fca328462c`  
**Frozen executable/test/config SHA:** `e8f568834752ce92796c9cddec5745b373b07d69`  
**Invalidated previous freeze:** `a3ba23a68f68aee894f818823ba1003511024f19`  
**Earlier invalidated freezes:** `952e3445d46d0b3770a499522abc1ad77315a228`, `0c4913931d8fcc19f5e3676be4e3ea9c4a84b67f`  
**Branch:** `master/51-network-rc`  
**PR:** #212 (draft)

## Goal

Close the Application Network roadmap by proving one exact semantic chain across publisher, federation, AI-host compatibility, Capability supply and hosted query execution, then compose all existing Enterprise + Network verification gates into one fail-closed Application Network RC command.

MASTER-51 remains a closure/integration phase, not a new semantic package or owner.

## Canonical cross-surface chain

```text
external publisher
        ↓
application-publisher-sdk
        ↓ canonical Distribution
application-federation exact lookup
        ↓
application-ai-host-sdk
        ↓ explicit Distribution integrity verification
canonical Application.capabilities exact reference
        ↓
capability-supply exact provider/location lookup
        ↓
hosted-capability-runtime one-shot query execution
        ↓
execution evidence with the same exact Capability id@version
```

## Application Network RC

```text
verify:application-network-rc
  ├─ verify:enterprise-rc
  ├─ verify:external-publisher-proof
  ├─ verify:external-ai-host-proof
  ├─ verify:external-provider-proof
  └─ verify:application-network-cross-surface
```

The RC orchestrator owns no semantic truth and fails immediately when a child gate fails.

## Core implementation and coverage

MASTER-51 integration/release surfaces include the independent cross-surface proof workspace, the fail-closed Network RC orchestrator, and root verification scripts. Coverage proves exact Application discovery, explicit Distribution integrity verification, exact protocol compatibility, direct Application Capability `id@version` → Capability supply lookup, no provider fallback/substitution, one-shot hosted execution, exact execution evidence identity, binding mismatch rejection, Action Boundary rejection, floating Application Capability rejection before digest generation, and absence of invented auth/trust/commercial/deployment authority.

## Q7 / Q8 history

### Initial executable freeze `0c491393...`

Q7 exposed a MASTER-51 TS7006 callback type issue plus inherited Enterprise RC lint failures. Those executable/config remediations invalidated the freeze.

Evidence: `docs/evidence/MASTER-51/Q7_ATTEMPT_1_FAIL.md`.

### Freeze `952e3445...`

Q7 code/repository gates passed, then native RC was blocked because local `xcrun` used standalone Command Line Tools. After full Xcode environment repair the operator later reported the final RC green on the same exact freeze.

Evidence:

- `docs/evidence/MASTER-51/Q7_ATTEMPT_2_ENV_BLOCKED.md`;
- `docs/evidence/MASTER-51/Q7_FINAL_PASS.md`.

That final green became historical when independent Q8 found an executable owner issue.

### Q8 attempt 1 — Capability release owner drift

Independent Q8 found duplicate Capability release identity validation: `capability-contract` validated CapabilityDefinition `id/version`, while `capability-supply` separately carried a local `RELEASE_VERSION` validator for query `capabilityId/capabilityVersion`.

Remediation:

- `capability-contract` now publicly owns `parse/serializeViraCapabilityReleaseReference()`;
- CapabilityDefinition delegates root `id/version` to it;
- Capability supply query delegates to it and maps only issue paths into `$query.*`;
- local supply release-semver validation is removed;
- parity/accessor hardening is covered by `tests/contract/capability-release-reference-owner.test.ts` and included in the cross-surface gate.

Evidence: `docs/evidence/MASTER-51/Q8_ATTEMPT_1_OWNER_DRIFT.md`.

### Q7 attempt 3 — internal contract-test import resolution

The operator ran exact freeze `a3ba23a68f68aee894f818823ba1003511024f19`.

Reported:

- workspace install PASS;
- boundaries PASS;
- lint PASS;
- typecheck FAIL with two TS2307 errors because the new `tests/contract/capability-release-reference-owner.test.ts` used bare workspace package imports;
- `set -e` stopped the run, so focused parity, cross-surface and final RC gates did not run.

Root cause: internal `tests/contract` suites use the established relative package source-entrypoint pattern. External `@acme` proof workspaces use bare public package-root imports; the new internal parity test had mixed those two conventions.

Remediation changes only the two internal test imports to:

- `../../packages/capability-contract/src/index.js`;
- `../../packages/capability-supply/src/index.js`.

No production source or semantic behavior changed in this remediation.

Evidence: `docs/evidence/MASTER-51/Q7_ATTEMPT_3_TYPECHECK_FAIL.md`.

## Q5–Q6 after latest remediation

Static security/architecture review repeated and PASS on:

`e8f568834752ce92796c9cddec5745b373b07d69`

Evidence: `docs/evidence/MASTER-51/Q5_Q6_REVIEW.md`.

## Current Q7 authority

The operator reported the full detached-SHA Q7 rerun **green** on exact frozen executable/test/config SHA:

`e8f568834752ce92796c9cddec5745b373b07d69`

Evidence: `docs/evidence/MASTER-51/Q7_RERUN_PASS.md`.

No test counts, timings, warning counts or native-device result details are reconstructed beyond the operator report. Earlier Q7 results remain historical only.

## Q8 active

Independent Q8 restarts from scratch after the current Q7 PASS and must:

- inspect current PR metadata, changed files and current diff;
- re-read canonical adjacent owners rather than trusting Q8 attempt 1;
- verify `capability-contract` is the sole Capability release owner and `capability-supply` only delegates/maps query errors;
- verify the internal parity test import convention is isolated from external public-root proof consumers;
- verify exact Application Capability `id@version` survives discovery → compatibility → supply → execution unchanged;
- verify no latest/fallback/substitution/ranking, no invented auth/trust/commercial/deployment authority, and no Action Boundary bypass;
- inspect current reviews, review threads and PR comments;
- classify current-head hosted Actions by actual job steps;
- prove frozen SHA `e8f568...` → closure head executable/package/test/boundary/config drift is zero.

If Q8 finds executable drift or another semantic issue, the freeze and this Q7 authority are invalidated and Q7 must run again. If Q8 passes, only docs/evidence closure may follow before Q9 exact-head merge discipline.
