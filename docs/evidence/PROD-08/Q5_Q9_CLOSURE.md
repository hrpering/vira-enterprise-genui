# PROD-08 Q5–Q9 — Security, Architecture, Verification and Closure Evidence

**Status:** CLOSURE CANDIDATE / DRAFT / NOT MERGE AUTHORIZED  
**Dependency join:** `57830a09d86416b8675a54c0d274dae58f95d07b`  
**Semantic branch:** `prod/08-artifact-durable-run-handoff`  
**Pull request:** #226  
**Implementation evidence parent:** `844da7ba73df04302e5eb457ecdd143f73f5451c`  
**Implementation evidence CI:** #1909 GREEN — repository/browser, iOS native and Android native jobs all passed.

This document is the final PROD-08 Q5–Q9 reverse-engineering and closure record. The commit containing this file is documentation-only and must itself receive exact-head GREEN CI before PROD-08 can be treated as a merge candidate. PR #226 remains DRAFT until explicit human merge authorization.

## Q5 — Security reverse-engineering

### Authority and data-isolation findings

- `artifact-contract` owns immutable artifact metadata identity, revision, digest, producer/source lineage, classification and retention semantics. Artifact bytes, signed URLs and provider credentials are not canonical artifact metadata.
- `integrations/object-store` remains a private tenant/project/environment-scoped byte persistence adapter and does not redefine artifact identity.
- PostgreSQL runtime persistence is exact-scope and RLS protected. API mutation access is not granted to runtime state tables; worker mutation remains least-privilege. Canonical record/column drift and stale revision writes fail closed.
- Durable ApplicationRun, Human Task and trigger inbox state advance through explicit revisions and expected-revision CAS. Duplicate completion/resume or stale workers cannot advance semantic state twice.
- Trigger delivery uses exact scope + source reference + event id identity, bounded replay/future-clock admission, durable inbox persistence and explicit lease semantics. Accepted early events survive replay-window expiry without forcing release re-resolution.
- Signed webhook verification uses exact HMAC-SHA256 semantics, bounded payloads, exact enterprise scope + SecretRef validation, snapshot-before-await behavior and transient key zeroization. Verification failure, scope drift, provider artifact/body identity mismatch or resolver failure does not persist the payload.

### Operator-control findings

- Operator pause/resume is not an ungoverned runtime method. The operator-control service cannot be created without an explicit authorizer.
- Lifecycle ownership remains in `application-runtime`: only `running|waiting -> paused` and `paused -> running|waiting` transitions are introduced. Existing terminal states remain terminal.
- Exact wait state and exact pinned Application resolution are preserved across pause/resume; operator resume does not invent execution or re-resolve `latest`.
- Every pause/resume transition is revision-safe CAS. Stale or duplicate operator calls fail with conflict and cannot advance state twice.
- The authorization request captures canonical run identity and expected revision before the async authorization boundary. Mutating caller input during authorization cannot retarget the committed run.
- Cross-scope and malformed requests fail closed without mutation.
- `enterprise-governance` composition is verified through the canonical governance pipeline. Final governance `allow` permits the operation; explicit governance deny and governance provider failure both produce `AUTHORIZATION_DENIED` with the run unchanged.
- No protected provider Action execution, Transaction Approval authority, one-time grants, billing or generalized async Capability execution is introduced by PROD-08.

## Q6 — Architecture reverse-engineering

The owner graph remains acyclic and authority is not duplicated:

- `artifact-contract` — artifact metadata identity and lineage.
- `integrations/object-store` — private bytes only.
- `application-runtime` — ApplicationRun, Human Task, trigger semantic state and operator lifecycle transitions.
- `application-resolution` — exact release/deployment/resolution identity.
- `work-context` — semantic work-state ownership; ApplicationRun references it rather than cloning it.
- `governance` + `enterprise-governance` — authorization and policy decisions.
- `action-boundary` — protected external effect boundary; it is not reused as generic lifecycle storage.
- deployment identity, Provider Connection and Transaction Approval retain their existing owners.

`application-runtime` does **not** add a production dependency on `governance` or `enterprise-governance`. Its package boundary remains limited to its declared runtime dependencies, while governance composition is injected through the operator authorizer port and proven in contract tests. This preserves dependency direction and prevents a new hidden policy authority inside the runtime package.

Human Task remains a handoff/work primitive and is explicitly not Transaction Approval.

## Q7 — Verification evidence

The implementation parent `844da7ba73df04302e5eb457ecdd143f73f5451c` passed hosted CI #1909 with all jobs GREEN.

The verified chain includes:

- live PostgreSQL migration / RLS / least-privilege / CAS / restore verification,
- identity and browser security verification,
- portable artifact drift verification,
- native portable conformance,
- iOS native build,
- Android native build/test,
- `verify:artifact-lineage`,
- `verify:artifact-isolation`,
- `verify:application-run-resume`,
- `verify:human-handoff`,
- `verify:trigger-delivery`,
- `verify:signed-webhook`,
- package-boundary validation,
- lint,
- TypeScript 6 typecheck,
- full repository test suite,
- TypeScript build,
- Experience Studio build,
- browser/E2E verification.

Focused runtime resilience evidence also covers exact replay-window boundary behavior, persisted early events beyond replay admission expiry, exact resolution pin preservation, duplicate trigger completion and duplicate ApplicationRun resume rejection.

Operator-control evidence additionally covers mandatory authorizer construction, allow/deny/throw behavior, canonical enterprise-governance allow/deny/provider-failure composition, lifecycle constraints, stale revision conflict, async request mutation safety, cross-scope isolation and exact wait/resolution preservation.

## Q8 — Independent PR reverse-engineering

Pre-closure implementation geometry from dependency join `57830a09d86416b8675a54c0d274dae58f95d07b` to implementation parent `844da7ba73df04302e5eb457ecdd143f73f5451c` is 13 commits / 33 changed files.

Observed scope remains confined to PROD-08 owners and verification surfaces:

- artifact contract,
- private object-store adapter,
- runtime PostgreSQL migration/store adapter,
- signed webhook adapter,
- application-runtime semantics,
- focused contract/production tests,
- root verification wiring,
- package-boundary declarations,
- PROD-08 plan/evidence documentation.

No Canvas, marketplace, provider-effect execution, commercial/billing, Transaction Approval or unrelated product-surface ownership was added. The operator-control implementation did not modify existing core ApplicationRun service semantics and did not introduce a production governance dependency.

At the time of closure review, PR #226 had no open inline review threads and no submitted review blocking the branch. This is not a substitute for merge authorization; it only records that no review debt was visible during Q8.

## Q9 — Closure rule

PROD-08 may be treated as **ready for human merge decision** only when all of the following are simultaneously true:

1. the commit containing this closure document is the exact PR head,
2. its hosted CI is fully GREEN,
3. PR #226 remains scope-clean and mergeable,
4. no new review debt or branch mutation appears after that CI,
5. explicit human merge authorization is given.

Until those conditions are satisfied, the PR remains DRAFT and must not be merged or auto-merged.

After the documentation-only closure commit receives exact-head GREEN CI, the PR body should be updated with the final head SHA and CI run number without changing branch contents. That metadata update is the final PROD-08 evidence binding; it does not authorize merge by itself.
