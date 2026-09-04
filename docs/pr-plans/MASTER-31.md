# MASTER-31 — Canvas Foundation

## Goal

Create the portable Vira Canvas foundation contract as an authoring draft envelope around existing canonical Application semantics, while keeping editor projection explicitly non-semantic and non-executable.

## Base

- authoritative `main`: `84ab9f8e75508e7975a8a1eaae74e3fae4c98d95`
- previous phase: MASTER-30 merged via PR #190
- branch: `master/31-canvas-foundation`
- frozen executable head: `0e4aef91cff43f935db9af03b1a92d5e14acd0e2`

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

## Verification history

The first local Q7 attempt on `b21784a89458edbab63098247960b28477dce58f` passed package boundaries and all 11 focused Canvas tests, but TypeScript exposed TS2345 because `Map` inferred a template-literal key type. The only executable correction was `0e4aef91cff43f935db9af03b1a92d5e14acd0e2`, which explicitly types the lookup as `Map<string, ViraApplicationGraph>`.

The operator then reported exact corrected-head Q7 green for:

```bash
pnpm check:boundaries
pnpm typecheck
pnpm vitest run tests/contract/application-canvas.test.ts
```

Hosted zero-step Action jobs remain infrastructure non-signal.

## Q0–Q9

- Q0: PASS — exact base `84ab9f8...`.
- Q1: PASS — reverse engineered Canvas constitution, Application/Graph owners, Studio Workbench and runtime authority.
- Q2: PASS — draft/projection ownership frozen.
- Q3: PASS — draft/projection types, parser, semantic extraction and serializers implemented.
- Q4: PASS — focused delegation/projection/bounds/authority-smuggling/security/determinism coverage implemented.
- Q5: PASS — security review of cross-authority field smuggling and projection references.
- Q6: PASS — architecture review proves Canvas remains authoring/projection, not runtime/publication/execution.
- Q7: PASS — operator-reported exact corrected-head local package boundary, TypeScript and focused tests.
- Q8: FINAL ACTUAL-DIFF REVIEW REQUIRED — prove post-freeze changes are docs/evidence only.
- Q9: BLOCKED until Q8; then squash merge and start MASTER-32 from new `main`.
