# Human Experience Studio workbench

The workbench is the user-facing authoring surface over the existing Studio contracts.

```text
Vira Component Palette + Puck Layout/Canvas + Vira Layers
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

The workbench uses Puck's supported default Layout/Canvas composition so the editor keeps the frame, canvas and drag-and-drop providers that Puck expects. Vira overrides the built-in `blocks` and `outline` plugin surfaces with its own component palette and canonical Layers panel instead of rendering Puck's native Components drawer or Outline tree. Views, Data and Actions are additional Vira plugins in the same supported Puck layout.

Palette insertion is dispatched through Puck's public `insert` action into a deterministic target: the selected layout's first slot, the selected leaf's current slot, the first root layout slot, or finally Puck's root zone. Existing canvas components remain under Puck's drag-and-drop mechanics for reorder and nesting. This keeps Studio independent from native drawer/outline implementation details without bypassing Puck's required canvas composition.

A new screen is never represented as an invalid empty view. The author chooses a registered layout component and the Workbench creates the screen with one canonical root node. Entry screens, referenced route targets and the final remaining screen cannot be deleted accidentally.
