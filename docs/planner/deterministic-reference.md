# Deterministic reference planner gate

Vira Enterprise GenUI's MVP planner is deliberately deterministic. The reference path is:

```text
explicit input
  -> State Resolver
  -> Capability Resolver
  -> Experience Planner
  -> Composition Planner
```

No stage invokes an LLM, uses wall-clock time, generates random IDs, calls a network, or reads customer/tool data directly. Candidate values and capability mappings are explicit inputs supplied by an owning adapter/host layer.

`tests/fixtures/planner/golden-pipelines.v1.json` locks representative success and fail-closed cases across travel, commerce, support, banking, and learning semantics. The fixtures verify state reconciliation, conflict preservation, capability ordering, ExperiencePlan output, composition priority, and deterministic repeated execution.

These are semantic reference fixtures, not customer templates or UI schemas. They contain no brand implementation, layout, DOM, component, action execution, or transport assumptions.

Any intentional change to planner semantics must update the relevant owning specification and golden expectation in the same reviewed PR; a test-only expectation rewrite without an architecture reason is not acceptable.
