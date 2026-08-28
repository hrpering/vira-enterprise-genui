# Planner state resolver

State Resolver is a deterministic planner primitive that reconciles explicit required task fields with canonical current state and explicit candidate values.

It does **not** infer domain values, call an LLM, read tool output directly, or silently overwrite an existing value.

## v1 input

```ts
{
  state: JsonObject;
  required: string[];
  candidates?: JsonObject;
}
```

In v1, requirements are top-level semantic state field names such as `origin`, `destination`, or `departure-date`. A field's value may itself be nested canonical JSON. Nested path mutation is intentionally not part of State Resolver; runtime patch semantics own document paths.

Candidate values must be explicit and may only target declared required fields. They may come from a later domain/data adapter, host application, or deterministic extraction layer, but State Resolver does not know their source.

## Resolution rules

For each required field, in caller-declared order:

- current only -> `known`;
- candidate only -> candidate is copied into resolved state and becomes `known`;
- neither -> `missing`;
- current + structurally equal candidate -> `known`;
- current + different candidate -> `conflict`, and current state remains unchanged.

Conflicts never silently select a winner.

Requirement/candidate field counts are bounded before recursive canonical parsing so oversized metadata cannot force unnecessary nested work.

## Boundary

State Resolver returns immutable canonical data only. It has no DOM/framework/network access, no customer/domain API calls, no model inference, no runtime lifecycle or permission behavior, and no hidden global state.
