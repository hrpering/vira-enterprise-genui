# Runnable Experience Studio demo

`examples/experience-studio-demo` is the browser proof for the human authoring surface. It is deliberately an in-memory host: no backend, credentials, network execution, persistence or deployment path is hidden inside the demo.

The demo exercises the real Studio workbench surface:

```text
Components / Layers
        +
Views / Data / Actions / Properties
        ↓
Puck canvas
        ↓
Studio Workbench commands
        ↓
canonical StudioDocument
        ↓
shared preview / publish gate
        ↓
StudioPublication
```

Required primitive and enum props receive editor-only insertion defaults so a newly dragged registered component can enter canonical authoring before the human edits its properties. These defaults are Puck configuration metadata only; they do not change the component catalog, StudioDocument, Protocol or production runtime contracts.

Run from the repository root:

```bash
pnpm --filter @vira-enterprise-genui/experience-studio-demo dev
```

A successful browser proof does not replace the repository verification gate. Release readiness still requires `pnpm verify` to execute successfully in a trusted environment.
