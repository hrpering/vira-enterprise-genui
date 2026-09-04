# Active Phase

**Phase:** MASTER-28 — Provider-Neutral Capability Contract  
**Status:** Q0–Q7 PASS / FINAL Q8 COMPARE REQUIRED  
**Base SHA:** `c17d5016a00f915604de73b9797a94e72692c5a6`  
**Frozen executable head:** `614467b91ba6c7798fe060c4e38fa51a914ddc1d`  
**Previous:** MASTER-27 merged via PR #187  
**Next after merge:** MASTER-29 — WorkContext

MASTER-28 introduces `@vira-enterprise-genui/capability-contract` as the canonical provider-neutral CapabilityDefinition owner while keeping existing `protocol.Capability` unchanged as the wire/projection identity envelope.

The new contract contains no provider binding, endpoint, credential, transport, effect catalog, policy or execution authority. Action-mediated capabilities bind an exact `actionType`; protected execution remains behind governance and the existing Action Boundary.

Local `pnpm check:boundaries`, `pnpm typecheck`, and the focused Capability Contract test were reported green on the exact frozen executable head above. Post-Q7 changes are documentation/evidence only. Squash merge remains blocked until final actual-diff Q8 proves the PR head is executable-identical to the frozen head.
