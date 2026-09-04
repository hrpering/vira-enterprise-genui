# MASTER-30 Reverse-Engineering Report

## Baseline

```text
main   62e0fe0a3101001ea4a69cb2732311094e5ebf2e
branch master/30-application-graph
```

## Owners inspected

- `APPLICATION_MODEL.md`
- `APPLICATION_AUTHORITY.md`
- `APPLICATION_VERSION_MODEL.md`
- MASTER-27 Application Package contract/plan
- MASTER-28 CapabilityDefinition contract
- MASTER-29 WorkContext contract
- `planner/composition-planner`
- `protocol/experience-plan`
- `studio-flow`
- package boundary graph

## Findings

1. Application semantic freeze explicitly reserves ApplicationGraph membership/edges as Application-level semantics while forbidding editor/runtime/provider state.
2. `application-package.flows[]` was deliberately left as exact opaque references pending MASTER-30.
3. Planner composition is ephemeral derived execution guidance, not immutable Application semantic authority.
4. Studio Flow owns interactions/routes inside one Studio document; reusing it for Application-level relationships would collapse two semantic layers.
5. Runtime and Action Boundary already own mutable execution and protected effect semantics; graph edges cannot imply direct execution.
6. Cycles must remain legal because ApplicationGraph is relational, not a scheduler/DAG executor.
7. Exact Experience references must preserve Pack id/version/entrypoint; Capability/Context use exact opaque version refs; Action uses the existing semantic `actionType` identity.
8. The graph requires only `protocol` for safe JSON parsing and semantic identity validation.

## Decision

Create `@vira-enterprise-genui/application-graph` as a small versioned semantic graph package with closed node/edge families and compatibility validation. Do not integrate it into runtime, planner, Canvas or `genui` aggregation in this phase.
