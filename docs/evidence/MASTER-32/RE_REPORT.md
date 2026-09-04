# MASTER-32 Reverse-Engineering Report

## Base

Authoritative `main`: `12aede59f4d034883ff4a2fe5ff8b5fe0887544b`

## Sources inspected

- `packages/application-canvas/src/index.ts`
- `packages/application-canvas/src/types.ts`
- `packages/application-canvas/src/validate.ts`
- `packages/studio-workbench/src/session.ts`
- `PACKAGE_OWNERSHIP.md`
- `MASTER_PLAN.md`

## Findings

1. MASTER-31 already owns canonical Canvas draft parsing, projection validation and `editorRevision` metadata. A second mutation package would duplicate ownership.
2. `studio-workbench` uses the correct authoring commit discipline: build a candidate, rerun canonical validators, and commit only the validated result.
3. Canvas mutation needs optimistic editor concurrency, but `editorRevision` must remain strictly separate from runtime/deployment/Application release revisions.
4. No existing Application-level mutation session owns stale-write rejection or atomic Canvas draft commits.
5. Publication, runtime, governance and protected Action execution owners must not become reachable by implication through a Canvas authoring session.

## Frozen implementation direction

Extend `application-canvas` with a framework-free session that:

- parses the initial draft canonically;
- retains only canonical frozen current state;
- requires exact `expectedRevision` for every mutation;
- fails stale writes without changing state;
- constructs candidates in memory;
- reparses every candidate through `parseViraCanvasDraft()`;
- commits only on success and increments revision exactly once;
- fails closed on safe-integer revision exhaustion;
- exposes semantic replacement plus projection mutations only.

No publish, deploy, runtime, governance, provider credential or Action execution APIs are added.
