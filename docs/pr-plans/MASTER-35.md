# MASTER-35 — Canvas Multiplayer + Semantic Review

## Goal

Add deterministic authoring collaboration for Canvas: bounded participants, ephemeral presence, concurrent semantic proposals, immutable peer review and stale-safe reviewed apply without becoming CRDT infrastructure, governance or runtime authority.

## Base

- authoritative `main`: `f17ae3cc920e672fcab1f97028dddcbe08040016`
- previous phase: MASTER-34 merged via PR #194
- branch: `master/35-canvas-multiplayer-semantic-review`
- frozen executable head: `74d8a2c4dc7e1f573600ed52af908c0e10443fd7`

## Ownership

`application-canvas` remains canonical owner of Canvas draft validation, `editorRevision`, atomic mutations and semantic replacement.

`application-canvas-collaboration` owns only authoring collaboration state: bounded participants, per-actor presence, semantic proposals, immutable peer reviews, editor approval threshold and reviewed apply delegation.

It does not own network/WebSocket transport, CRDT/OT, persistence/distributed locks, authentication, enterprise governance/authorization, publication/deployment, runtime, Capability/Action execution, AI generation or canonical Application/Graph schemas.

## Collaboration semantics

Presence is ephemeral and never increments `editorRevision`. Actor identity is asserted by the host after its own authentication/authorization; this package does not authenticate participant claims.

Multiple proposals may bind to the same revision without mutating the draft. Applying one proposal through the canonical mutation session advances revision and makes competing proposals stale.

Review rules:

- author cannot review own proposal;
- one immutable review per reviewer/proposal;
- distinct approvals must meet session `requiredApprovals`;
- any rejection blocks that proposal;
- review gates editor mutation only; it is not governance, authorization or publication approval.

Apply rules:

- current revision must equal proposal base revision;
- projection compatibility must be `compatible`;
- required reviews must pass;
- final mutation delegates to `createViraCanvasMutationSession().replaceSemantics()`;
- successful apply clears ephemeral presence so invalid cursors/selections do not survive semantic change.

## Q5 security review

PASS.

- all mutation-style inputs use shared fail-closed safe JSON parsing;
- participants are bounded and unique;
- presence is graph-local, sequence-monotonic and bounded;
- proposal ids are unique and base revision is exact;
- Application identity/publisher authority cannot be replaced by a proposal;
- no-op proposals are rejected;
- self-review and duplicate peer reviews are rejected;
- any rejection blocks apply;
- distinct approval threshold is enforced;
- projection-breaking proposals cannot silently apply;
- successful apply delegates to canonical mutation validation;
- actor ids are explicitly host-asserted and are not represented as authentication/security credentials.

## Q6 architecture review

PASS.

Executable dependencies are only `application-canvas` and `protocol`. No runtime, governance, policy, deployment, Action Boundary/Ledger, AI-provider or networking package is reachable from this owner.

This package is not a CRDT or collaboration server. A future transport may carry these contracts but cannot redefine Canvas semantic/revision authority.

## Local Q7 history

First attempt on `68583242ce8afb71e04d70d0843a9c81d54a9dad`:

- `pnpm check:boundaries` PASS;
- focused collaboration suite 12/12 PASS;
- `pnpm typecheck` failed on two TS6-only issues: a sort callback typo (`localeCompare(right)` instead of `right.id`) and union narrowing not surviving into nested closures.

Both were corrected without semantic behavior changes by sorting on `right.id` and binding the successful mutation session value before nested functions. Corrected frozen executable head is `74d8a2c4dc7e1f573600ed52af908c0e10443fd7`.

The corrected head was operator-reported green for boundaries, TypeScript and the focused suite.

## Q0–Q9

- Q0 PASS — exact base `f17ae3cc920e672fcab1f97028dddcbe08040016`.
- Q1 PASS — targeted reverse engineering.
- Q2 PASS — collaboration/review ownership frozen.
- Q3 PASS — collaboration package/session implemented.
- Q4 PASS — focused participant/presence/concurrency/review/apply/security coverage implemented.
- Q5 PASS — fail-closed/security review.
- Q6 PASS — architecture/authority review.
- Q7 PASS — operator-reported exact corrected frozen-head local boundary/type/focused gate.
- Q8 PASS — final compare from frozen executable head contains documentation/evidence changes only.
- Q9 READY — squash merge PR #195, fetch new authoritative `main`, then start MASTER-36.
