# PROD-01 Q0 — Baseline

Baseline parent is the frozen, green PROD-00 source head `91e8fad8b54fd78c99359d968f75ebec4bcc3562`.

At that parent:

- `apps/`, `integrations/`, and `ops/` production roots do not exist;
- `pnpm-workspace.yaml` covers only `packages/*` and `examples/*`;
- root TypeScript build/typecheck does not include production app or ops roots;
- no Vercel production definition exists;
- no Railway production IaC exists;
- no production health/readiness/build shell exists;
- no typed runtime environment or immutable release manifest exists.

PROD-00 remains unmerged only because live `main` protection is deferred. This branch is stacked on its exact frozen head and may not merge first.
