# Data flow

External data must cross an explicit normalization boundary before it can influence an experience.

```text
LLM / tool / customer API output
        |
        v
 domain/tool adapter
        |
        v
 canonical DomainData
        |
        +----> state resolver
        |
        +----> capability resolver
        |
        v
 ExperiencePlan
        |
        v
 ComposedExperience
        |
        v
 runtime-web renderer
```

## Invariant

A renderer must never interpret arbitrary raw LLM, tool, or customer API payloads. The renderer receives only validated composed experience data and registered component bindings.
