# Human Experience Studio workbench

The workbench is the user-facing authoring surface over the existing Studio contracts.

```text
Vira Component Palette + Puck Canvas + Layers + Properties
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

The component palette is Vira-owned rather than a direct rendering of Puck's native Components drawer. In the custom-composition workbench, palette insertion is dispatched through Puck's public insert action into a deterministic target: the selected layout's first slot, the selected leaf's current slot, the first root layout slot, or finally Puck's root zone. Existing canvas components remain under Puck's drag-and-drop mechanics for reorder and nesting. This keeps the Studio UI independent from native drawer/outline implementation details while preserving Puck as the editor engine.

A new screen is never represented as an invalid empty view. The author chooses a registered layout component and the Workbench creates the screen with one canonical root node. Entry screens, referenced route targets and the final remaining screen cannot be deleted accidentally.