# Active Phase

**Phase:** MASTER-30 — Semantic ApplicationGraph Contract  
**Status:** Q0–Q7 PASS / FINAL Q8 READY  
**Base SHA:** `62e0fe0a3101001ea4a69cb2732311094e5ebf2e`  
**Frozen executable head:** `f9c70fe20e2764de2e701b8c44e9cd1114d20eb9`  
**Previous:** MASTER-29 merged via PR #189  
**Next after merge:** MASTER-31 — Canvas Foundation

MASTER-30 introduces `@vira-enterprise-genui/application-graph` as the canonical versioned Application semantic relationship owner.

It composes exact Experience, Capability, Context and Action identities without owning their payloads or execution authorities. Graph cycles are legal; there is no start node, condition, retry, scheduler, timeout or executor semantic in the contract.

Canvas projection state and runtime state remain explicitly outside the graph.

Operator-reported local Q7 is PASS on the exact frozen executable head for package boundaries, TypeScript typecheck and focused `application-graph.test.ts`. Final Q8 must prove every post-Q7 change is documentation/evidence only before exact-head squash merge.
