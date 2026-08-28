# Planner capability resolver

Capability Resolver turns explicit state blockers into semantic capability buckets. It never invents a capability and does not select components.

## v1 input

- `missing`: semantic state fields currently absent;
- `conflicts`: semantic state fields with unresolved conflicts;
- `requirements`: one explicit field -> capability mapping per potentially blocking field;
- `available`: optional semantic capabilities that may be offered now;
- `future`: optional semantic capabilities anticipated later.

Every active blocker must have a mapping. Missing mappings fail closed instead of guessing a UI/control.

Requirement configuration order determines the order of the `required` capability bucket. A capability identity may appear only once across requirement mappings, `available`, and `future`, which keeps the resulting ExperiencePlan buckets unambiguous. The final total is also bounded by Protocol's `EXPERIENCE_PLAN_MAX_CAPABILITIES`, so this resolver cannot emit a bucket set that ExperiencePlan itself must reject for size.

## Boundary

`Capability != component`. This resolver knows semantic capability identities only. It has no component names/props, layout, brand tokens, endpoint/tool execution, LLM inference, runtime permissions, DOM, or network behavior.
