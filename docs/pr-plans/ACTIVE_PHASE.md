# Active Phase

**Phase:** MASTER-28 — Provider-Neutral Capability Contract  
**Status:** Q0–Q8 PASS / Q9 READY TO SQUASH MERGE  
**Base SHA:** `c17d5016a00f915604de73b9797a94e72692c5a6`  
**Frozen executable head:** `614467b91ba6c7798fe060c4e38fa51a914ddc1d`  
**Final PR head:** `1ddfcd5d1694729daa95bd54ef656e6373587299`  
**Previous:** MASTER-27 merged via PR #187  
**Next after merge:** MASTER-29 — WorkContext

MASTER-28 introduces `@vira-enterprise-genui/capability-contract` as the canonical provider-neutral CapabilityDefinition owner while keeping existing `protocol.Capability` unchanged as the wire/projection identity envelope.

The new contract contains no provider binding, endpoint, credential, transport, effect catalog, policy or execution authority. Action-mediated capabilities bind an exact `actionType`; protected execution remains behind governance and the existing Action Boundary.

Local `pnpm check:boundaries`, `pnpm typecheck`, and the focused Capability Contract test were reported green on the exact frozen executable head above.

Final Q8 compared `614467b91ba6c7798fe060c4e38fa51a914ddc1d` to `1ddfcd5d1694729daa95bd54ef656e6373587299`; the only changes were `docs/evidence/MASTER-28/VERIFICATION.md`, `docs/pr-plans/ACTIVE_PHASE.md`, and `docs/pr-plans/MASTER-28.md`. No executable content changed after Q7.
