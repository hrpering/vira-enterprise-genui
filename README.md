# Vira Enterprise GenUI

Vira Enterprise GenUI is a framework-agnostic runtime and integration platform that turns approved application semantics into governed, brand-native experiences across web, iOS, Android and external AI-host surfaces.

## Current status

**CONDITIONAL PASS — PROVISIONAL CODE-COMPLETE / LIVE RELEASE GATES OPEN**

The PROD-00..22 repository program is implemented through PR #252 at `main@25eaaf6`. The exact-main repository gate passes 328 test files and 1,836 tests, plus lint, type checking, dependency boundaries and builds. This is not a Production MVP RC, Full Platform RC, release tag or production-ready claim.

Live Vercel/Railway deployment evidence, protected-main enforcement, real backup/restore, UAT/SLO/load/soak evidence and the production device/external-host matrix remain open. See the [production status](docs/production/README.md) and [live release blockers](docs/production/LIVE_GATE_BLOCKERS.md).

## Architecture

```text
Host AI / Agent / Application
          │
          ▼
 protocols / adapters / exact resolution
          │
 planning / composition / governed runtime
          │
 durable runs + protected Action execution
          │
 evidence / ledger / commercial reconciliation
          │
 Web / iOS / Android / external host surfaces
```

Experience Studio is the optional human authoring surface. Manual and Studio authoring converge on canonical document/publication semantics; editors and integrations do not become runtime or semantic authority.

The production frontend target is Vercel. Railway hosts the API and worker services. PostgreSQL and external identity, secret, KMS, object-store and observability services remain behind explicit ports and deployment evidence.

## Repository authority

- Engineering status and invariants: [MASTER_PLAN.md](MASTER_PLAN.md)
- Current phase state: [docs/pr-plans/ACTIVE_PHASE.md](docs/pr-plans/ACTIVE_PHASE.md)
- Final/V6 production contract: [production plan](docs/production/VIRA_UNIFIED_ARCHITECTURE_PRODUCTION_PLAN_FINAL.md)
- Package ownership: [PACKAGE_OWNERSHIP.md](PACKAGE_OWNERSHIP.md)
- Executable dependency authority: `tooling/package-boundaries.config.mjs`
- Architecture: [docs/architecture](docs/architecture)
- Application Network thesis: [docs/strategy/APPLICATION_NETWORK_THESIS.md](docs/strategy/APPLICATION_NETWORK_THESIS.md)

Repository truth overrides older plan snapshots. The downloaded V5 production plan is historical and is not execution authority.

## Development

Requires Node.js 24+ and pnpm 11.24.0.

```bash
pnpm install --frozen-lockfile
pnpm check:boundaries
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Run the repository and browser gates with:

```bash
pnpm verify
pnpm verify:all
```

Named plan gates include `verify:renderer-budget`, `verify:webhook-replay`, `verify:production-ui`, `verify:operations-e2e`, `verify:security-adversarial`, `verify:external-host-identity`, `verify:network-operational`, `verify:protocol-conformance` and `verify:provider-routing`.

Live gates such as production deploy, real restore and production load/soak require environment credentials plus immutable deployment/artifact evidence. They are tracked in `docs/production/LIVE_GATE_BLOCKERS.md` and cannot be replaced by local simulation.

## Runnable demo

```bash
pnpm demo:experience-studio
```

The Studio demo build currently reports a non-blocking approximately 853 KB minified entry-chunk warning. Production web owned CSS is independently gated at 57,344 bytes and measured 19,659 bytes at provisional closure.

## Security boundary

Vira does not grant arbitrary HTML/JavaScript execution, unrestricted API access, implicit-latest resolution, hidden provider substitution or governance bypass. Protected effects remain behind canonical identity, governance, immutable approval, one-time grants, durable execution, postcondition verification and Action Ledger boundaries. Malformed or untrusted inputs fail closed.

## Contribution rule

Architecture and contracts precede implementation. A phase is mergeable only after its bounded responsibility, negative/failure behavior, security and architecture review, exact-head repository verification and independent reverse-engineering review are evidenced. Live-environment claims additionally require immutable environment and artifact evidence.
