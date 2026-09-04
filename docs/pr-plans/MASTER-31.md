# MASTER-31 — Canvas Foundation

## Goal

Create the portable Vira Canvas foundation contract as an authoring draft envelope around existing canonical Application semantics, while keeping editor projection explicitly non-semantic and non-executable.

## Base

- authoritative `main`: `84ab9f8e75508e7975a8a1eaae74e3fae4c98d95`
- previous phase: MASTER-30 merged via PR #190
- branch: `master/31-canvas-foundation`

## Reverse-engineered ownership

Existing owners remain authoritative:

- `application-package` owns Application release/reference semantics.
- `application-graph` owns Application semantic nodes/edges.
- `studio-workbench` owns authoring mechanics inside one Studio Experience and is not the Application-level Canvas owner.
- `runtime-core` owns runtime state/revision/lifecycle.
- publication/deployment/governance/Action owners keep their existing authority.

`application-canvas` OWNS only:

- a bounded opaque Canvas `draftId`;
- monotonic/non-negative `editorRevision` as editor concurrency/change metadata, not runtime revision;
- aggregation of canonical Application Package + ApplicationGraph drafts by delegating to their canonical parsers;
- editor projection state: active graph, graph-local node positions, viewport and selection;
- deterministic serialization of the Canvas draft;
- projection-free semantic extraction/serialization.

It DOES NOT OWN:

- new Application or ApplicationGraph schemas;
- runtime/deployment state;
- publication truth or a `published` flag;
- provider credentials/bindings;
- governance verdicts or authorization;
- protected Action execution;
- React/UI/drag-drop component semantics;
- editor command/mutation history in this phase.

## Contract

```text
CanvasDraft
├── schemaVersion
├── draftId
├── editorRevision
├── semantics
│   ├── application   # parsed by application-package
│   └── graphs[]      # parsed by application-graph
└── projection
    ├── activeGraphRef | null
    └── graphViews[]
        ├── graphRef
        ├── nodeLayouts[] { nodeId, x, y }
        ├── viewport { x, y, zoom }
        └── selection { nodeIds[], edgeIds[] }
```

## Invariants

- Canonical semantic payloads are delegated to current owners; Canvas never copies their validators.
- Projection graph refs must resolve to exact graph id + release version present in `semantics.graphs`.
- Node layouts and selection must resolve against the referenced canonical graph.
- Projection arrays and coordinates are bounded; duplicate views/layouts/selections fail closed.
- Unsafe JSON/accessor/custom-prototype input fails through the shared protocol JSON boundary.
- Root authority-smuggling fields such as runtime/deployment/provider/credentials/governance/execute/published fail closed.
- `editorRevision` is not runtime revision, deployment revision or Application release version.
- Changing only projection must not change `serializeViraCanvasSemantics()` output.
- Parsed values are detached/deeply frozen.
- Package dependencies are exactly `application-canvas → application-package + application-graph + protocol`.

## Q0–Q9

- Q0: exact base `84ab9f8...`.
- Q1: reverse engineer Canvas constitution, Application/Graph owners, Studio Workbench and runtime authority.
- Q2: freeze draft/projection ownership above.
- Q3: implement draft/projection types, parser, semantic extraction and serializers.
- Q4: focused delegation/projection/bounds/authority-smuggling/security/determinism tests.
- Q5: security review of cross-authority field smuggling and projection references.
- Q6: architecture review proving Canvas remains authoring/projection, not runtime/publication/execution.
- Q7: local `pnpm check:boundaries && pnpm typecheck && pnpm vitest run tests/contract/application-canvas.test.ts`.
- Q8: independent actual PR diff review.
- Q9: squash merge only after exact-head Q7 and final executable-clean compare; then start MASTER-32 from new `main`.
