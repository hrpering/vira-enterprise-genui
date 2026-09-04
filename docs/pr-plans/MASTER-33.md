# MASTER-33 — Canvas AI Co-author

## Goal

Add an Application-level AI semantic proposal engine for Canvas that can propose, explain and refactor canonical Application semantics while remaining strictly human-reviewed and non-executable.

## Base

- authoritative `main`: `6bd8072852c758a6369a84c8ce4e19eefd154afb`
- previous phase: MASTER-32 merged via PR #192
- branch: `master/33-canvas-ai-coauthor`
- frozen executable head: `3a81dddeffca63d333298f71a3c8f4faa47ab15f`

## Ownership

Existing owners remain authoritative:

- `application-package` owns Application release/reference semantics.
- `application-graph` owns Application semantic nodes/edges.
- `application-canvas` owns canonical Canvas draft/projection + mutation session.
- `studio-ai` owns AI proposal generation inside one Experience.
- publication/deployment/runtime/governance/Action owners retain their existing authority.

MASTER-33 introduces `application-canvas-ai` because Application-level provider invocation/proposal review is distinct from both pure Canvas state and Experience-level Studio AI.

`application-canvas-ai` owns only bounded prompt/provider request construction, host-supported reference validation, canonical candidate validation, identity/publisher preservation, unsupported-reference rejection, deterministic semantic diff, projection compatibility and the frozen human-review proposal artifact.

It does not own direct proposal application, publication/promotion/deployment, runtime execution, governance/authorization verdicts, protected Action execution, provider credentials as canonical semantics, Canvas coordinates/viewport/selection generation, autonomous fallback, or a second Application/Graph schema.

## Provider boundary

The provider receives only `version`, `prompt`, `draftId`, `editorRevision`, `baseSemantics` and exact host-supported references. It does not receive Canvas projection.

The provider must return exactly:

```text
{
  semantics,
  explanation
}
```

Extra publish/execute/control fields fail closed.

## Supported-reference and integrity policy

A candidate may reuse exact references already present in the base Application or add references explicitly supplied by the host for Experiences, Capabilities, Context Types, Actions, Flows, Brand refs, Governance requirements, Protocol projections, Entitlements, Metering and Host capability ids.

New ApplicationGraph releases may be authored only inside the current Application publisher namespace. Graph node references must satisfy both conditions:

1. the reference is base-existing or host-supported; and
2. the candidate Application itself declares the referenced Experience/Capability/Context/Action.

Every embedded candidate ApplicationGraph release must also be declared by candidate `application.flows`. This prevents individually valid Application/Graph payloads from producing dangling cross-semantic proposals.

## Human-review proposal

The returned proposal contains only data:

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

## Review outcome

Q5 security review found one pre-freeze integrity gap: a Graph node could retain a base-supported reference after the candidate Application removed its declaration. The final executable implementation closes this with a cross-semantic guard and dedicated focused coverage. No support-catalog bypass, provider projection leak, credential authority path, publish/deploy/runtime/Action dependency, or silent provider fallback remains in the reviewed surface.

Q6 architecture review confirms `application-canvas-ai` depends only on `application-canvas`, `application-package` and `protocol`; canonical semantics stay with existing owners and proposal application stays with the separate human-controlled Canvas mutation flow.

## Q0–Q9

- Q0 PASS — exact base `6bd8072852c758a6369a84c8ce4e19eefd154afb`.
- Q1 PASS — targeted reverse engineering.
- Q2 PASS — provider/support/proposal ownership frozen.
- Q3 PASS — `application-canvas-ai` proposal gate implemented.
- Q4 PASS — focused authority/support/diff/integrity coverage implemented.
- Q5 PASS — fail-closed security review, including cross-semantic integrity fix.
- Q6 PASS — architecture/authority review.
- Q7 REQUIRED — local exact frozen-head package-boundary/type/focused tests.
- Q8 PRE-Q7 PASS — actual scope reviewed; final post-Q7 executable-clean compare still required.
- Q9 BLOCKED until Q7/final Q8; then squash merge and start MASTER-34 Canvas Simulation + Replay from new `main`.

Exact local Q7:

```bash
pnpm check:boundaries
pnpm typecheck
pnpm vitest run tests/contract/application-canvas-ai.test.ts tests/contract/application-canvas-ai-integrity.test.ts
```

Hosted Actions on the frozen head produced verify/iOS/Android jobs with `steps: null`; these are infrastructure non-signal.
