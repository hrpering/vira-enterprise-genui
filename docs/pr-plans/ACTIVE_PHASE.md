# Active Phase

**Phase:** MASTER-29 — Bounded WorkContext Contract  
**Status:** Q0–Q6 IMPLEMENTED / LOCAL Q7 REQUIRED  
**Base SHA:** `7c6716f90810528b4dfc4f2f040755ab5f96ecb1`  
**Previous:** MASTER-28 merged via PR #188  
**Next after merge:** MASTER-30 — Application Graph

MASTER-29 introduces `@vira-enterprise-genui/work-context` as the canonical provider-neutral Context definition + immutable snapshot owner.

Application `contextTypes[]` and Capability `contextRequirements[]` remain exact references into this semantic family; those owners are not modified into Context payload stores.

WorkContext explicitly excludes chat history, user memory, prompt dumps, provider state, tenant scope, governance/policy, runtime lifecycle and protected execution authority. Receipt items are evidence/data only.

Merge remains blocked until the exact executable head passes local boundary/type/focused tests and the PR completes actual-diff Q8.
