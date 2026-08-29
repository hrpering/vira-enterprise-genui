# Runtime Web component security gate

Runtime Web authorizes both semantic capability identity and the resolved component implementation reference before any DOM side effect.

```text
validated RenderModel
       |
       v
capability allowlist
       |
       v
 component allowlist
       |
       v
responsive / DOM lifecycle
```

The order is intentional. Capability authorization answers whether the semantic interaction may exist. Component authorization independently answers whether the resolved implementation reference may render. A Component Adapter mapping only selects an implementation for a validated capability; it is never permission.

Both gates are atomic. Runtime Web does not prune denied bindings or partially render an experience. A capability denial returns `CAPABILITY_DENIED`; a resolved component denial returns `COMPONENT_DENIED`. Neither path measures the container, begins a DOM transaction, or mounts a component.

The public Web SDK requires both policies and snapshots them during configuration. Direct `mountExperience()` revalidates both so callers cannot bypass the gates by skipping the SDK wrapper.

These render gates remain separate from Runtime Core action permissions. Rendering an authorized component does not authorize any action it may emit.
