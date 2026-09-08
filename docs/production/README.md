# Production program status

**Current verdict:** `CONDITIONAL PASS — PROVISIONAL CODE-COMPLETE / LIVE RELEASE GATES OPEN`

The PROD-00..22 repository implementation is provisionally complete through PR #252 at `main@25eaaf6`. Exact-main verification covers contracts, security negatives, database structure, browser behavior, package boundaries, lint, type checking and builds. This conclusion applies to repository code and CI evidence only.

Vira is not production-authoritative and neither release cut-line may be presented as an RC. The live gates must close before a release tag, `VIRA PRODUCTION MVP RC`, `VIRA FULL PLATFORM RC` or production-ready claim is permitted.

## Document authority

- [Final/V6 production plan](VIRA_UNIFIED_ARCHITECTURE_PRODUCTION_PLAN_FINAL.md) is the target contract and dependency graph.
- [Active phase](../pr-plans/ACTIVE_PHASE.md) records whether repository implementation work is active. It currently records no active repository phase.
- [PROD-22 program completion audit](../evidence/PROD-22/PROGRAM_COMPLETION_AUDIT.md) is the provisional repository completion audit.
- [Live release blockers](LIVE_GATE_BLOCKERS.md) is the authority for outstanding production-environment evidence.
- [Production owner matrix](PROD_OWNER_MATRIX.md) maps semantic ownership and the live integration boundary.

The downloaded V5 plan is historical input. It does not override Final/V6 or current repository truth.

## Deployment boundary

The frontend deployment target is Vercel. Railway hosts the API and worker services. A local build or simulated recovery test cannot substitute for deployment-ID/image-digest-correlated evidence from those environments.

Open work includes protected-main enforcement; deployed browser-to-BFF-to-Railway identity and CSRF checks; Railway restart and rollback; real PostgreSQL restore; object-store/KMS/secret recovery; design-partner UAT; SLO, alert, load and soak evidence; and the production device/external-host matrix.

## Verification interpretation

`pnpm verify` is the repository regression gate. `pnpm verify:all` adds the current browser suite. Named production aliases expose the plan's repository-checkable responsibilities, while commands ending in `:live` require real environment credentials and immutable evidence and are intentionally not part of local PASS.

The Studio demo currently emits an approximately 853 KB minified entry-chunk warning. It is tracked as non-blocking performance work because no JavaScript bundle release budget was frozen for that demo. The enforced owned-CSS budget remains 57,344 bytes; the production web stylesheet measured 19,659 bytes at provisional closure.
