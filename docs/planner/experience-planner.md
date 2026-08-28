# Experience Planner

Experience Planner is the deterministic orchestration layer that combines Intent Protocol validation, State Resolver, Capability Resolver, and final ExperiencePlan Protocol validation.

```text
intent + state + explicit candidates + capability configuration
  -> Intent validation
  -> State Resolver
  -> Capability Resolver
  -> ExperiencePlan Protocol validation
  -> frozen ExperiencePlan
```

The planner does not generate plan IDs, infer missing domain values, choose components, create layouts, execute actions, or call a model/network. Plan IDs and candidate values are explicit caller inputs.

## Input surfaces

- `id`: explicit plan identifier;
- `intent`: canonical Intent input;
- `state`: current canonical task state;
- `requiredState`: ordered semantic task fields;
- `candidateState`: optional explicit candidate values;
- `capabilityRequirements`: explicit blocker field -> Capability mappings;
- `availableCapabilities` / `futureCapabilities`: optional semantic capability buckets.

Missing or conflicting state can still produce a valid plan when each blocker has an explicit required capability that lets the user progress or resolve the conflict.

## Boundary

Experience Planner produces Protocol's semantic ExperiencePlan only. It has no regions/layout, DOM, CSS, components, brand tokens, runtime permissions, host effects, raw DomainData/tool interpretation, LLM calls, or network access.
