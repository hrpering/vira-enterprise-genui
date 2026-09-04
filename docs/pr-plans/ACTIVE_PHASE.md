# Active Phase

**Phase:** MASTER-30 — Semantic ApplicationGraph Contract  
**Status:** Q0–Q6 IMPLEMENTED / LOCAL Q7 REQUIRED  
**Base SHA:** `62e0fe0a3101001ea4a69cb2732311094e5ebf2e`  
**Previous:** MASTER-29 merged via PR #189  
**Next after merge:** MASTER-31 — Canvas Foundation

MASTER-30 introduces `@vira-enterprise-genui/application-graph` as the canonical versioned Application semantic relationship owner.

It composes exact Experience, Capability, Context and Action identities without owning their payloads or execution authorities. Graph cycles are legal; there is no start node, condition, retry, scheduler, timeout or executor semantic in the contract.

Canvas projection state and runtime state remain explicitly outside the graph.

Merge is blocked until exact branch head passes local boundary/type/focused tests and final actual-diff Q8.
