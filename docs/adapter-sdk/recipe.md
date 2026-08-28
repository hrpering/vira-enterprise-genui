# Adapter SDK Recipe

An Experience Recipe is a deterministic planning blueprint for one canonical intent identity. It tells the host/planner which semantic task state is required and which canonical capabilities are available to resolve or progress that task.

A recipe contains:

- a semantic recipe `id`;
- an exact canonical intent identity `{ namespace, name }`;
- ordered `requiredState` fields;
- optional explicit blocker-field -> Capability mappings;
- optional available and future Capability buckets.

Recipes do not contain candidate/user data. They also do not own layout families, disclosure policy, components, props, runtime actions, endpoints, prompts, models, or tool execution. Those remain with their owning layers.

`matchRecipeIntent(recipe, intent)` performs exact canonical namespace/name matching after Intent Protocol validation. Confidence and parameters do not affect recipe selection. An unmatched intent fails closed instead of falling back to fuzzy/model routing.