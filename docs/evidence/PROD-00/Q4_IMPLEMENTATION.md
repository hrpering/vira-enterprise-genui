# PROD-00 Q4 — Implementation

**Status:** COMPLETE for repository-controlled PROD-00 scope  
**Date:** 2026-09-05

Q4 implements only the release-foundation work frozen in Q2. It does not add production runtime/domain semantics.

## Implemented

- activated the `PROD-00..PROD-22` roadmap and removed the competing active roadmap path;
- reconciled Machine Commerce into deferred `PROD-20` scope;
- recorded the production owner matrix and reference Application;
- froze vendor/region, security/data, SLO/DR/incident/support and release/migration ADRs;
- added `verify:plan-coherence` to fail on roadmap drift;
- corrected hosted iOS CI to build the actual `ViraNative` scheme;
- replaced Android generated-source path wiring with an AGP Variant API producer relationship;
- committed the generated workspace `pnpm-lock.yaml`;
- removed the temporary lockfile bootstrap writer and restored workflow-level `contents: read`;
- changed hosted dependency installation to `pnpm install --frozen-lockfile`.

## Intentionally not implemented

- application/API/worker shells;
- database schema or migrations;
- OIDC runtime;
- provider integrations;
- durable workflow semantics;
- Application V2 runtime contracts;
- Machine Commerce runtime.

## Administrative boundary

GitHub `main` protection/ruleset enablement is an administrative repository setting, not repository source. It remains a mandatory Q7/Q9 external gate and is not represented as complete by this document.
