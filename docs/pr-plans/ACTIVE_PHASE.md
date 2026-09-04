# Active Phase

**Phase:** MASTER-31 — Canvas Foundation  
**Status:** Q0–Q6 IMPLEMENTED / LOCAL Q7 REQUIRED  
**Base SHA:** `84ab9f8e75508e7975a8a1eaae74e3fae4c98d95`  
**Previous:** MASTER-30 merged via PR #190  
**Next after merge:** MASTER-32 — Canvas Mutation Session

MASTER-31 introduces `@vira-enterprise-genui/application-canvas` as a framework-free authoring draft + editor projection contract.

Canonical ApplicationPackage and ApplicationGraph semantics are delegated to their existing parsers. Canvas owns only draft identity/editor revision and non-semantic projection such as active graph, node positions, viewport and selection.

Projection changes are explicitly separated from canonical semantic serialization. Runtime, deployment, publication, provider, governance and protected Action execution authority remain outside Canvas.

Merge remains blocked until exact branch head passes local boundary/type/focused tests and final actual-diff Q8.
