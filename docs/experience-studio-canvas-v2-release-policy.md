# Experience Studio Canvas v2 release policy

## Versioning and migration

`StudioExperienceDocument`, Studio Brand Package, portable bundle, collection scopes and action payload bindings are versioned contracts. Canvas v2 does not guess migrations. A persisted version is either accepted as-is or transformed by an explicit deterministic migration covered by fixtures; unsupported versions fail closed.

Existing Studio v1 documents without `repeat`, `scope`, or `payloadBindings` remain valid. Canvas v2 additions are optional and the parser normalizes them without changing legacy semantics.

## Security gate

- no backend endpoints, credentials, arbitrary scripts/styles or executable implementation fields in declarative packages
- exact renderer registry parity for the active brand
- state/domain/action access crosses `StudioHostBridge`
- action permissions remain authoritative in Runtime Web
- malformed, stale or oversized inputs fail closed
- audit records contain lifecycle metadata only; no prompts, payloads, headers, domain snapshots or secrets

## Resource budgets

- schema view/node/binding/interaction limits remain authoritative
- repeated runtime records are bounded by `STUDIO_RUNTIME_MAX_REPEAT_ITEMS`
- portable import/export is bounded to `STUDIO_PORTABLE_BUNDLE_MAX_BYTES`
- runtime records never increase authored document node count

## Accessibility and authoring gate

The browser acceptance pass must cover keyboard selection of editor controls, visible focus, semantic buttons/labels, component selection, Content/Design/Data/Actions inspector access, view switching, publish controls and no keyboard trap inside trusted brand renderer portals.

## Final release checklist

Run from the latest authoritative stacked head after upstream PRs are rebased/retargeted in order:

```bash
pnpm install
pnpm check:boundaries
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm build:experience-studio
pnpm demo:pegasus-chat:check
pnpm verify:browser
pnpm verify:all
```

Then review changed-file hygiene, secrets, generated artifacts, package boundaries, PR mergeability and the authoritative `main` SHA after each squash merge.
