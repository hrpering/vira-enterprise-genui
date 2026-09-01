# GENUI-124 — Flight Experience Pack migration

## Scope

Migrate the existing Pegasus Chat Flight experience from Chat-owned Flight contracts/global targeting to the Generic GenUI bridge introduced by GENUI-123.

## Invariants

- Experience Pack: `vira/flight-booking@1.0.0`
- entrypoint: `booking`
- artifact role: `studio-publication`
- immutable static publication; invocation data lives in payload/host state
- exact `instanceId` command targeting only
- no latest/active global experience target
- one Flight tool surface: `vira_experience` (`present` or `command`)
- generic resolver/Chat packages remain domain-neutral
- existing Studio runtime/compiler remain authoritative
- Flight UI and booking behavior remain on the existing airline renderers/domain repository

## Verification gate

Do not merge from source inspection alone. Final gate is current-head `pnpm verify:all` plus browser multi-instance checks after the stack is complete.
