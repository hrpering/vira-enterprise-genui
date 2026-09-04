# MASTER-33 — Canvas AI Co-author

## Goal

Add an Application-level AI semantic proposal engine for Canvas that can propose, explain and refactor canonical Application semantics while remaining strictly human-reviewed and non-executable.

## Base

- authoritative `main`: `6bd8072852c758a6369a84c8ce4e19eefd154afb`
- previous phase: MASTER-32 merged via PR #192
- branch: `master/33-canvas-ai-coauthor`

## Ownership

Existing owners remain authoritative:

- `application-package` owns Application release/reference semantics.
- `application-graph` owns Application semantic nodes/edges.
- `application-canvas` owns canonical Canvas draft/projection + mutation session.
- `studio-ai` owns AI proposal generation inside one Experience.
- publication/deployment/runtime/governance/Action owners retain their existing authority.

MASTER-33 introduces `application-canvas-ai` because Application-level provider invocation/proposal review is distinct from both pure Canvas state and Experience-level Studio AI.

`application-canvas-ai` OWNS only:

- bounded prompt validation;
- provider-neutral proposal request construction;
- exact host-supported reference catalog validation;
- generated candidate semantic validation through canonical Canvas/Application/Graph owners;
- preservation of current Application identity/publisher authority;
- unsupported-reference rejection;
- deterministic semantic diff generation;
- projection compatibility reporting;
- a frozen human-review proposal artifact carrying the base `editorRevision`.

It DOES NOT OWN:

- direct mutation/application of a proposal;
- publication, promotion or deployment;
- runtime execution;
- governance/authorization verdicts;
- protected Action execution;
- provider credentials/bindings as canonical semantics;
- Canvas coordinates, viewport or selection generation;
- autonomous fallback when the provider fails;
- a second Application/Graph schema.

## Provider boundary

The provider receives only:

```text
version
prompt
draftId
editorRevision
baseSemantics
supported exact references
```

It does not receive Canvas projection.

The provider must return exactly:

```text
{
  semantics,
  explanation
}
```

Any extra publish/execute/control fields fail closed.

## Supported-reference policy

A candidate may reuse exact references already present in the base Application or add references explicitly supplied by the host in the bounded support catalog:

- Experiences
- Capabilities
- Context Types
- Actions
- Flows
- Brand refs
- Governance requirements
- Protocol projections
- Entitlement refs
- Metering refs
- Host capability ids

New ApplicationGraph releases may be authored by AI only inside the current Application publisher namespace. Graph node references are checked against the same supported Experience/Capability/Context/Action sets.

## Human-review proposal

The returned proposal contains:

```text
version
draftId
expectedRevision
baseSemantics
candidateSemantics
explanation
diff[]
projectionCompatibility
```

`projectionCompatibility` is `compatible` or `requires-reconcile`. The proposal contains no apply/publish/deploy/execute method.

## Q0–Q9

- Q0: exact base `6bd8072852c758a6369a84c8ce4e19eefd154afb`.
- Q1: targeted reverse engineering of Canvas, Studio AI, ApplicationPackage/Graph and authority boundaries.
- Q2: freeze provider/support/proposal ownership above.
- Q3: implement `application-canvas-ai` proposal gate.
- Q4: focused tests for support catalogs, authority smuggling, identity preservation, diff determinism, provider failure and projection reconciliation.
- Q5: security review proving unsupported authority cannot be invented and provider output fails closed.
- Q6: architecture review proving proposal generation cannot publish/apply/execute.
- Q7: local `pnpm check:boundaries && pnpm typecheck && pnpm vitest run tests/contract/application-canvas-ai.test.ts`.
- Q8: independent actual PR diff review.
- Q9: squash merge only after exact-head Q7 and final executable-clean compare; then start MASTER-34 Canvas Simulation + Replay from new `main`.
