# GENUI-125 — Generic Bridge Non-Flight Proof

## Goal

Prove the `vira_experience` bridge is domain-neutral by mounting a second independent Experience Pack without changing `packages/genui-chat` or `packages/genui-resolver`.

## Scope

- add `vira/recipe@1.0.0` with entrypoint `card`
- Recipe-owned Studio publication, renderers, host state, actions, and command aliases
- compose Flight + Recipe in one Experience Registry and one Runtime Capability Registry
- use one Chat bridge for both Packs
- make the Chat toolkit and API route domain-neutral; registered presenter details live in integration-owned demo modules
- remove the old single-Flight bridge composer
- prove exact `instanceId` isolation with simultaneous Flight + Recipe instances
- add a deterministic Pegasus browser proof that mounts both Packs without an LLM/API key

## Invariants

- no Recipe or Flight branch in generic Chat consumer files
- no changes under `packages/genui-chat` or `packages/genui-resolver`
- Recipe command cannot mutate Flight state
- Flight command cannot mutate Recipe state
- wrong instance/command fails closed
- Recipe publication artifact digest and size match exact JSON content
- existing full Flight journey remains covered by GENUI-124
- browser console/page fatal errors are release blockers

## Final gate

`pnpm verify:all` is the final gate. It includes the repository checks, the existing Experience Studio browser suite, and the Pegasus Flight + Recipe simultaneous multi-experience Playwright proof.
