# PROD-15 — Production Web and Operational Surfaces

## Scope

Convert `apps/vira-web` from the PROD-01 static deployment shell into a React + Vite operational control center without moving semantic authority into the app layer.

## Contract

- customer surfaces: Chat, Applications, Runs, Artifacts, Tasks, Approvals, Waiting, Needs Attention, Audit and Usage/Billing;
- builder/admin surfaces: Studio, Flow, Integrations, Connections, publish/release controls, health, diagnostics and recovery;
- all backend access passes through the existing same-origin BFF with exact organization/project/environment and `/v1` target paths;
- uncertain, mismatch, degraded and offline states never present success or enable an implied provider mutation;
- responsive, keyboard, light/dark, reduced-motion and axe checks are executable;
- app-owned CSS remains below 57,344 bytes.

## Verification

`pnpm verify:production-web` runs the static owner/budget verifier, TypeScript, Vite build and Playwright desktop/mobile suite. Root `pnpm verify` includes this gate.

## Closure

Code may merge after exact-head CI. Live Vercel smoke, Railway integration and design-partner UAT remain release blockers and do not become implicit PASS evidence.
