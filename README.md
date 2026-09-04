# Vira Enterprise GenUI

Vira Enterprise GenUI is an embeddable, framework-agnostic runtime and integration SDK for turning approved application semantics into governed, brand-native interactive experiences across product surfaces.

## Current architecture

```text
Host AI / Agent / Application
          │
          ▼
      protocols / adapters
          │
      planning / composition
          │
       runtime-core
          │
   governance + Action Boundary
          │
  Web / iOS / Android / host surfaces
```

Experience Studio is an optional human authoring surface. Manual authoring and Studio authoring converge on the same canonical Studio document/publication semantics; editor implementations are not runtime authority.

## Repository truth

- Engineering execution authority: `MASTER_PLAN.md`
- Ownership guide: `PACKAGE_OWNERSHIP.md`
- Executable dependency authority: `tooling/package-boundaries.config.mjs`
- Active phase plans: `docs/pr-plans/`
- Architecture documents: `docs/architecture/`
- Long-range product thesis: `docs/strategy/APPLICATION_NETWORK_THESIS.md`

## Development

Requires Node.js 24+ and pnpm 11.24.0.

```bash
pnpm install
pnpm check:boundaries
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Repository verification:

```bash
pnpm verify
pnpm verify:all
```

Release/native gates when applicable:

```bash
pnpm check:studio-native
pnpm verify:ios-simulator
pnpm verify:android-emulator
pnpm verify:external-brand-proof
pnpm verify:enterprise-rc
```

## Current runnable root demo

```bash
pnpm demo:experience-studio
```

Only commands exposed by the current root `package.json` are documented here. Historical or proof-specific demos must not be presented as root commands unless they are actually wired into the repository.

## Security boundary

Vira does not grant arbitrary HTML/JavaScript execution, unrestricted API access, implicit-latest resolution or governance bypass. Host integrations register approved components, data and action surfaces; protected effects remain behind canonical action/governance boundaries and malformed/untrusted inputs fail closed.

## Contribution rule

Architecture and contracts precede implementation. A phase is mergeable only after its bounded responsibility, negative/failure behavior, security/architecture review, repository verification and independent reverse-engineering review are evidenced against the exact head being merged.
