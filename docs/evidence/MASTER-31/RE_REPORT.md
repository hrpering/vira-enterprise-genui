# MASTER-31 Reverse-Engineering Report

## Baseline

```text
main   84ab9f8e75508e7975a8a1eaae74e3fae4c98d95
branch master/31-canvas-foundation
```

## Sources inspected

- `docs/strategy/APPLICATION_NETWORK_THESIS.md`
- `APPLICATION_AUTHORITY.md`
- `APPLICATION_VERSION_MODEL.md`
- MASTER-30 ApplicationGraph contract
- MASTER-27 Application Package contract
- `studio-workbench` public authoring/session types
- executable package boundary graph

## Findings

1. Canvas is constitutionally an authoring surface: it can create/edit/propose Application semantics but cannot become runtime, publication, governance or effect authority.
2. ApplicationPackage and ApplicationGraph already provide canonical parsers; Canvas must delegate rather than duplicate either schema.
3. Studio Workbench solves authoring inside one `StudioExperienceDocument`; reusing it as the Application-level Canvas model would incorrectly couple Application semantics to Puck/Studio UI implementation.
4. Canvas needs editor-only state that must not pollute ApplicationGraph: graph position, viewport, selection and an editor revision.
5. A Canvas draft may hold unpublished canonical semantic drafts. Mutating that draft does not mutate a published Application release; later publication phases must create immutable release evidence through canonical owners.
6. Projection must be independently serializable from semantics so layout changes cannot silently create semantic release changes.
7. Runtime revision, deployment revision and Canvas editor revision are distinct namespaces.

## Decision

Create `@vira-enterprise-genui/application-canvas` as a portable, framework-free draft/projection contract depending only on `application-package`, `application-graph` and `protocol`. UI/session/mutation machinery is deferred to later Canvas phases.
