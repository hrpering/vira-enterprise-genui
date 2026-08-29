# Experience Studio demo

Runnable browser proof for the human Studio workbench.

```bash
pnpm --filter @vira-enterprise-genui/experience-studio-demo dev
```

The demo intentionally uses only in-memory catalogs and a Pegasus-style flight-discovery document. It proves the editor surface, not a production backend integration.

Try:
- drag components from **Components**;
- reorder/nest through canvas or **Layers**;
- change colors, typography, spacing and layout in **Properties**;
- create/switch screens in **Views**;
- bind approved sources in **Data**;
- bind actions and success/empty/error routes in **Actions**;
- use Puck **Publish** to produce a validated `StudioPublication`.
