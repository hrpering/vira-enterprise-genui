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

The provider must return exactly `{ semantics, explanation }`; extra publish/execute/control fields fail closed.

## Supported-reference and integrity policy

A candidate may reuse exact references already present in the base Application or add references explicitly supplied by the host for Experiences, Capabilities, Context Types, Actions, Flows, Brand refs, Governance requirements, Protocol projections, Entitlements, Metering and Host capability ids.

New ApplicationGraph releases may be authored only inside the current Application publisher namespace. Graph node references must be both base-existing/host-supported and declared by the candidate Application. Every embedded candidate ApplicationGraph release must also be declared by candidate `application.flows`.

## Human-review proposal

The proposal is data-only and contains `version`, `draftId`, `expectedRevision`, `baseSemantics`, `candidateSemantics`, `explanation`, `diff[]` and `projectionCompatibility`. It contains no apply/publish/deploy/execute method.

## Review outcome

Q5 found one pre-freeze cross-semantic dangling-reference gap and closed it with a dedicated guard + regression suite. Q6 confirmed proposal-only package boundaries with no runtime/publication/deployment/governance/Action authority dependency.

## Q0–Q9

- Q0 PASS — exact base `6bd8072852c758a6369a84c8ce4e19eefd154afb`.
- Q1 PASS — targeted reverse engineering.
- Q2 PASS — provider/support/proposal ownership frozen.
- Q3 PASS — `application-canvas-ai` proposal gate implemented.
- Q4 PASS — focused authority/support/diff/integrity coverage implemented.
- Q5 PASS — fail-closed security review including cross-semantic integrity fix.
- Q6 PASS — architecture/authority review.
- Q7 PASS — operator-reported exact frozen-head package-boundary, TypeScript and both focused Canvas AI suites green.
- Q8 PASS — final compare from frozen executable head contains docs/evidence changes only; no executable drift.
- Q9 READY — exact-head squash merge, then MASTER-34 from new authoritative `main`.

Hosted Actions on the frozen head produced verify/iOS/Android jobs with `steps: null`; these are infrastructure non-signal.
