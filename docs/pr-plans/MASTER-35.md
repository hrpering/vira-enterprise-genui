# MASTER-35 — Canvas Multiplayer + Semantic Review

## Goal

Add deterministic authoring collaboration for Canvas: bounded participants, ephemeral presence, concurrent semantic proposals, immutable peer review and stale-safe reviewed apply without becoming CRDT infrastructure, governance or runtime authority.

## Base

- authoritative `main`: `f17ae3cc920e672fcab1f97028dddcbe08040016`
- previous phase: MASTER-34 merged via PR #194
- branch: `master/35-canvas-multiplayer-semantic-review`

## Ownership

`application-canvas` remains canonical owner of Canvas draft validation, `editorRevision`, atomic mutations and semantic replacement.

MASTER-35 introduces `application-canvas-collaboration` for authoring collaboration state only.

It owns:

- registered participant identities/display names;
- per-actor monotonic presence sequence;
- graph-local actor selection/cursor presence;
- semantic proposal identity/author/base revision/summary;
- preservation of Application identity/publisher authority;
- immutable peer reviews;
- session-level required distinct approval count;
- self-review/duplicate-review rejection;
- rejection blocking;
- stale proposal detection;
- projection compatibility check;
- final apply delegation to `application-canvas` mutation session.

It does not own:

- network/WebSocket transport;
- CRDT/OT algorithms;
- persistence/distributed locks;
- enterprise governance or authorization;
- publication/deployment approval;
- runtime execution;
- Capability/Action execution;
- AI provider generation;
- canonical Application/Graph schemas.

## Collaboration semantics

Presence is ephemeral and never increments `editorRevision`.

Multiple proposals may bind to the same editor revision. Proposal creation itself does not mutate the draft.

Review rules:

- author cannot review own proposal;
- one immutable review per reviewer/proposal;
- distinct approvals must meet session `requiredApprovals`;
- any rejection blocks that proposal;
- review is an editor mutation gate, not governance/authorization.

Apply rules:

- current editor revision must still equal proposal base revision;
- projection compatibility must remain `compatible`;
- required reviews must pass;
- final mutation delegates to `createViraCanvasMutationSession().replaceSemantics()`;
- successful semantic apply increments revision through the existing owner and clears ephemeral presence;
- competing proposals from the old base revision become stale.

## Q0–Q9

- Q0 PASS — exact base `f17ae3cc920e672fcab1f97028dddcbe08040016`.
- Q1 PASS — targeted reverse engineering.
- Q2 PASS — collaboration/review ownership frozen.
- Q3 IMPLEMENTED — collaboration package/session surface.
- Q4 IMPLEMENTED — focused participant/presence/concurrency/review/apply/security coverage.
- Q5 REQUIRED — fail-closed/security review.
- Q6 REQUIRED — architecture/authority review.
- Q7 REQUIRED — exact-head local package-boundary/type/focused suite.
- Q8 REQUIRED — independent actual PR diff review.
- Q9 BLOCKED until Q7/Q8; then squash merge and start MASTER-36 from new authoritative `main`.
