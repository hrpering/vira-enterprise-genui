# MASTER-28 Reverse-Engineering Report

## Baseline

```text
main   c17d5016a00f915604de73b9797a94e72692c5a6
branch master/28-capability-contract
```

## Owners inspected

- `APPLICATION_MODEL.md`
- `APPLICATION_AUTHORITY.md`
- `PACKAGE_OWNERSHIP.md`
- `packages/protocol/src/capability/{types,validate}.ts`
- `packages/tool-bridge/src/types.ts`
- `packages/action-boundary/src/types.ts`
- `packages/adapter-sdk/src/action/types.ts`
- `packages/protocol/src/domain-data/types.ts`
- `packages/protocol/src/json-value.ts`
- `packages/protocol/src/semantic-id.ts`
- `tooling/package-boundaries.config.mjs`

## Findings

1. `protocol.Capability` is a wire identity envelope with exactly `version` and `id`; changing it into the semantic definition would break responsibility and compatibility.
2. `tool-bridge` consumes that wire Capability alongside Intent/context, confirming protocol metadata is not the provider-neutral semantic owner.
3. `action-boundary` already canonically owns Action definitions, including `effect` (`read|write|irreversible`) and `idempotency`; Capability must not create a second effect catalog.
4. MASTER-26 authority explicitly requires protected effects to remain behind governance + Action Boundary and says providers are bindings, not semantic owners.
5. No canonical general-purpose data schema language exists. Creating JSON Schema/OpenAPI/provider payload grammar in MASTER-28 would be speculative scope expansion.
6. Exact opaque semantic references are already established by MASTER-27 and are sufficient for input/output/context contract references until their own owners exist.
7. Shared `parseJsonValue` supplies the repository-safe untrusted JSON boundary and `isSemanticNamespace` supplies canonical semantic identity validation.

## Decision

Create `@vira-enterprise-genui/capability-contract` as a provider-neutral semantic owner with only a `protocol` dependency. Preserve `protocol.Capability` unchanged as wire/projection metadata. Represent invocation as `query` or Action-mediated `action`; an action capability carries only exact `actionType`, never duplicate effect/idempotency or provider execution details.
