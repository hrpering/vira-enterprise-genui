# Studio React runtime rendering

`@vira-enterprise-genui/studio-runtime-react` renders a validated `StudioRuntimeSession.currentView()` with the same bounded design semantics used by the Puck editor preview.

```text
StudioPublication
      ↓
Studio Runtime
      ↓
current validated view
      ↓
Studio Runtime React
      ├─ canonical parent / slot hierarchy
      ├─ shared safe design adapter
      ├─ trusted brand renderers
      └─ declared event emitters
      ↓
brand-native React UI
```

The production renderer does not depend on Puck. Puck remains an authoring implementation detail.

Brand renderers receive a context containing normal component props, rendered child slots and an `emit` function. Reserved Studio design props are removed before the brand renderer is invoked and are applied by Vira through the shared React design adapter. This keeps editor preview and production output aligned while preserving a clean brand component API.

Event emission still enters the existing Studio runtime dispatch path, which delegates canonical action identity, permission and effect behavior to Runtime Web/Core. The renderer does not call endpoints or tools directly.
