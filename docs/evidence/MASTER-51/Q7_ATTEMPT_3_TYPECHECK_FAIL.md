# MASTER-51 — Q7 Attempt 3 — Contract-Test Import Resolution FAIL

**Date:** 2026-09-05  
**Phase:** MASTER-51 — Cross-Surface Exact Semantics + Application Network RC  
**Operator checkout:** `a3ba23a68f68aee894f818823ba1003511024f19`  
**Result:** FAIL — test-harness remediation required

## Operator-reported execution

The operator confirmed the exact detached HEAD:

`a3ba23a68f68aee894f818823ba1003511024f19`

Reported gate results:

- workspace install completed successfully;
- `pnpm check:boundaries` PASS;
- `pnpm lint` PASS;
- `pnpm typecheck` FAIL with two TS2307 module-resolution errors in `tests/contract/capability-release-reference-owner.test.ts`:
  - line 6: cannot find module `@vira-enterprise-genui/capability-contract`;
  - line 7: cannot find module `@vira-enterprise-genui/capability-supply`.

The command block used `set -e`, so execution stopped at typecheck. The focused Capability release-owner suite, cross-surface Network proof, and final Application Network RC were not executed in this attempt.

No test counts or timings are inferred for gates that did not run.

## Root cause

The new parity test lives under `tests/contract`, whose established repository pattern imports package source entrypoints through relative `../../packages/.../src/index.js` paths. It is not an external workspace consumer package. The test incorrectly used bare workspace package-root imports, so TypeScript could not resolve those two imports from the root contract-test compilation context.

This does not change the canonical Capability release-owner design. External `@acme` proof workspaces continue to use public bare package-root imports as intended; only the internal contract parity test must follow the existing contract-test import convention.

## Remediation

`tests/contract/capability-release-reference-owner.test.ts` now imports:

- `../../packages/capability-contract/src/index.js`;
- `../../packages/capability-supply/src/index.js`.

No production source, wire schema, runtime behavior, dependency boundary, provider selection, Action authority, authentication, entitlement, deployment, or cloud semantic changed in this remediation.

## Freeze consequence

The previous executable/test/config freeze `a3ba23a68f68aee894f818823ba1003511024f19` is invalid for final merge authority because the executable test harness changed after this failed Q7 attempt.

The new executable/test/config freeze is:

`e8f568834752ce92796c9cddec5745b373b07d69`

A full local Q7 rerun on that exact SHA is required before Q8 may restart.
