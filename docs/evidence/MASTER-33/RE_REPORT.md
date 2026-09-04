# MASTER-33 Reverse-Engineering Report

## Base

Authoritative `main`: `6bd8072852c758a6369a84c8ce4e19eefd154afb`

## Sources inspected

- `docs/strategy/APPLICATION_NETWORK_THESIS.md`
- `packages/application-canvas/src/types.ts`
- `packages/application-canvas/src/validate.ts`
- `packages/application-canvas/src/session.ts`
- `packages/application-package/src/types.ts`
- `packages/application-package/src/validate.ts`
- `packages/application-graph/src/types.ts`
- `packages/studio-ai/src/types.ts`
- `packages/studio-ai/src/generate.ts`
- `packages/studio-ai/src/v2.ts`
- `PACKAGE_OWNERSHIP.md`
- `tooling/package-boundaries.config.mjs`

## Findings

1. `studio-ai` is explicitly an Experience-level proposal surface and validates generated Studio documents against component/binding/flow owners. It is not the Application-level Canvas AI owner.
2. `application-canvas` owns canonical Canvas draft/projection parsing and the stale-safe mutation session. Adding provider invocation there would mix pure authoring state with AI/provider mechanics.
3. ApplicationPackage and ApplicationGraph already provide the canonical semantics that AI proposals must reuse; MASTER-33 must not create parallel schemas.
4. Current Canvas projection is editor-only. AI semantic proposal generation does not need node coordinates, viewport or selection and should not receive them.
5. A provider-neutral AI proposal must not invent Capability/Context/Action/Experience/governance/commercial/protocol authority. The host therefore needs to provide an exact bounded support catalog.
6. Human review requires an explicit semantic diff and the base `editorRevision`; generation must never auto-apply, publish, deploy or execute a protected Action.
7. Graph changes may invalidate current editor projection. This is review information, not a reason to give AI projection mutation authority.

## Frozen implementation direction

Create `@vira-enterprise-genui/application-canvas-ai` as a separate Application-level AI proposal layer.

Flow:

```text
prompt + canonical base Canvas draft + host-supported exact refs
        ↓
provider request: base semantics only (no projection)
        ↓
provider response: exact { semantics, explanation }
        ↓
canonical Canvas/Application/Graph validation
        ↓
identity/publisher authority check
        ↓
supported-reference check
        ↓
deterministic semantic diff + projection compatibility
        ↓
human review artifact
```

The proposal carries `expectedRevision` but has no apply/publish/deploy/execute method. Human-reviewed application remains a separate Canvas mutation/publication workflow.
