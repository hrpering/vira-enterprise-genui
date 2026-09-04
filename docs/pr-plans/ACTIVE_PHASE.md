# Active Phase

**Phase:** MASTER-35 — Canvas Multiplayer + Semantic Review  
**Status:** Q0–Q4 IMPLEMENTED / Q5–Q6 REVIEW IN PROGRESS  
**Base SHA:** `f17ae3cc920e672fcab1f97028dddcbe08040016`  
**Previous:** MASTER-34 merged via PR #194  
**Next after merge:** MASTER-36 — Design System / External Design Import

MASTER-35 introduces `@vira-enterprise-genui/application-canvas-collaboration` as an authoring-only collaboration layer.

Registered participants can publish ephemeral graph-local presence and create concurrent semantic proposals against the same exact `editorRevision`. Presence never mutates the Canvas draft.

Semantic reviews are immutable peer-review records. Authors cannot self-review, duplicate reviews fail closed, any rejection blocks apply, and distinct approvals must meet the session threshold.

Approved apply remains delegated to the existing Canvas mutation session. Stale proposal bases fail closed; projection-breaking proposals require reconciliation before apply. Successful semantic apply increments revision through the canonical owner and clears ephemeral presence.

This review gate is editor collaboration only, not enterprise governance, authorization, publication approval or execution authority.

Merge remains blocked until Q5/Q6, exact-head local Q7 and final actual-diff Q8.
