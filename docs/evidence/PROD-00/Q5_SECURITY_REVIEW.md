# PROD-00 Q5 — Security Review

**Status:** PASS for source/configuration scope; repository protection remains an external closure gate  
**Date:** 2026-09-05

## Review findings

1. **Supply-chain determinism** — the workspace now has a committed `pnpm-lock.yaml`; hosted CI uses `pnpm install --frozen-lockfile` and therefore fails closed on manifest/lockfile drift.
2. **Workflow token minimization** — the temporary lockfile bootstrap writer is removed. The final CI workflow has only top-level `contents: read`; no PR comment/write or branch-write permission remains.
3. **Pinned Actions** — checkout, setup-node, setup-java and Gradle setup are pinned to immutable commit SHAs rather than floating tags.
4. **Secret assumptions** — PROD-00 adds no application secret, token, provider credential or plaintext credential path. The production secret/KMS boundary is frozen in the security/data ADR for later implementation phases.
5. **Tenant/semantic ownership** — the owner matrix does not create a second authorization, approval, verification, ledger or durable-state semantic owner. Later packages must reuse the recorded canonical boundaries.
6. **Native build integrity** — Android keeps Gradle validation enabled; the repair models generated Kotlin as task output rather than disabling validation or hard-coding a growing consumer-task allowlist.
7. **Fail-closed governance** — `verify:plan-coherence` rejects a competing active roadmap marker instead of tolerating parallel execution plans.

## Residual gate

`main` must still be configured PR-only with required healthy checks and no routine developer bypass. Because that is repository administration rather than source code, Q5 does not claim it is enabled. Q9 remains blocked until live GitHub ruleset/branch-protection proof exists.
