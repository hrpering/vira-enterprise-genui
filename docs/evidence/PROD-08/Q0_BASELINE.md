# PROD-08 Q0 — Baseline

- Dependency join: `57830a09d86416b8675a54c0d274dae58f95d07b`
- Join parents:
  - PROD-06 `95c98688ac910dea00364775f40de394726d2221`
  - PROD-07 `fe1fee0dfdd03020c1efda9a43b390433051f2d9`
- Hosted CI evidence: run `#1862` GREEN on the exact join head.
- CI jobs GREEN: repository/browser verify, iOS native, Android native.
- Semantic branch: `prod/08-artifact-durable-run-handoff` created directly from the verified join.
- `application-resolution` already owns exact release + deployment revision + resolution digest.
- `work-context` already owns semantic work items including artifact/evidence/result/decision/receipt kinds.
- `deployment-plane` artifact records are application distribution artifacts and must not be reused as user/work artifact identity.
- `integrations/*` is not a pnpm workspace root; new semantic owners belong under `packages/*`, while object-store remains an integration adapter surface.

## Q0 invariant

PROD-08 must add durable work/artifact semantics without re-owning Application resolution, WorkContext, deployment artifact identity, Provider Connection, or later protected Action execution.
