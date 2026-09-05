# MASTER-51 — Q7 Attempt 1 FAIL

**Date:** 2026-09-05  
**Operator checkout:** `0c4913931d8fcc19f5e3676be4e3ea9c4a84b67f`  
**Result:** FAIL — executable remediation required

## Operator-reported execution

The operator confirmed the commanded checkout exactly:

`0c4913931d8fcc19f5e3676be4e3ea9c4a84b67f`

Observed gate results reported by the operator:

- workspace install completed; pnpm reported an existing lockfile warning because the command intentionally used `--lockfile=false`;
- `pnpm check:boundaries` PASS;
- `pnpm typecheck` FAIL with TS7006 at `examples/application-network-rc/application-network-rc.test.ts:130`: publisher digest callback parameter `input` implicitly had type `any`;
- `pnpm verify:application-network-cross-surface` PASS: 2 test files, 7 tests, duration 220ms as reported by the operator;
- `pnpm verify:application-network-rc` FAIL inside the existing Enterprise RC baseline because `eslint .` reported 7 errors in baseline files.

The reported ESLint failures were:

1. `packages/application-canvas-ai/src/propose.ts` — `no-control-regex`;
2. `packages/application-canvas-collaboration/src/session.ts` — `no-control-regex`;
3. `packages/application-canvas-design-import/src/import.ts` — `no-useless-escape`;
4. `packages/application-canvas-design-import/src/import.ts` — `no-control-regex`;
5. `packages/application-protocol-projection/src/validate.ts` — `no-control-regex`;
6. `packages/application-publisher-sdk/src/prepare.ts` — `no-control-regex`;
7. `packages/commercial-entitlement/src/entitlement.ts` — `@typescript-eslint/no-unused-vars` for `ViraCommercialEntitlementSet`.

## Classification

The TS7006 failure is MASTER-51-owned and blocks Q7.

The seven ESLint errors were already present in authoritative `main`: none of those source files appeared in the pre-Q7 `main` → MASTER-51 executable diff. They are therefore inherited Enterprise RC baseline debt, not newly introduced MASTER-51 domain semantics. However MASTER-51 intentionally makes `verify:enterprise-rc` a mandatory child of `verify:application-network-rc`, so the final Application Network RC cannot waive or ignore those failures.

## Remediation

- type the publisher digest callback with the public `ViraApplicationPublisherDigestInput` export;
- extend the repository's existing intentional `no-control-regex` validation-file override only to the exact baseline validator files reported by Q7;
- preserve the design-import source-token validation behavior with a file-local lint-policy override for the existing escaped slash;
- keep `@typescript-eslint/no-unused-vars` enabled for `commercial-entitlement`, ignoring only the exact pre-existing `ViraCommercialEntitlementSet` type symbol rather than disabling the rule broadly.

No Application/Capability/runtime authority is changed by the baseline lint remediation.

## Freeze consequence

The executable/test freeze `0c4913931d8fcc19f5e3676be4e3ea9c4a84b67f` is invalid for final merge authority because executable/config files changed after this failed Q7 attempt.

A new executable freeze and a full Q7 rerun are required before Q8 may begin.
