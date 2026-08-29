# Human Experience Studio workbench

The workbench is the user-facing authoring surface over the existing Studio contracts.

```text
Puck Components + Layers + Properties
             │
             ├── Views       -> canonical screen commands
             ├── Data        -> approved binding sources
             ├── Actions     -> approved action aliases + outcome routes
             │
             ▼
       StudioWorkbenchSession
             │
             ▼
       StudioDocument
             │
             ├── Preview
             └── Publish -> StudioPublication
```

Puck owns canvas mechanics only. It does not own view state, business bindings, action aliases or publish semantics. When a Puck-generated id is selected, the Workbench resolves it through the authoring session's explicit id-resolution seam before invoking canonical Data or Action commands.

A new screen is never represented as an invalid empty view. The author chooses a registered layout component and the Workbench creates the screen with one canonical root node. Entry screens, referenced route targets and the final remaining screen cannot be deleted accidentally.
