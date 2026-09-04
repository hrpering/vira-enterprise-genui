# Active Phase

**Phase:** MASTER-28 — Provider-Neutral Capability Contract  
**Status:** Q0–Q6 IMPLEMENTED / LOCAL Q7 REQUIRED  
**Base SHA:** `c17d5016a00f915604de73b9797a94e72692c5a6`  
**Previous:** MASTER-27 merged via PR #187  
**Next after merge:** MASTER-29 — WorkContext

MASTER-28 introduces `@vira-enterprise-genui/capability-contract` as the canonical provider-neutral CapabilityDefinition owner while keeping existing `protocol.Capability` unchanged as the wire/projection identity envelope.

The new contract contains no provider binding, endpoint, credential, transport, effect catalog, policy or execution authority. Action-mediated capabilities bind an exact `actionType`; protected execution remains behind governance and the existing Action Boundary.

Merge remains blocked until the exact executable head passes the local boundary/type/focused-test Q7 and the PR completes independent actual-diff Q8.
