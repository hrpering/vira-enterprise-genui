# Studio React/Puck shell

The Studio React shell is the first executable editor layer. It assembles Puck's required component render functions from an explicit trusted in-memory registry while keeping all executable values outside Vira's serializable Studio contracts.

## Boundary

```text
StudioComponentCatalog          Trusted renderer registry
        |                                |
        v                                v
Studio Puck metadata  +  exact renderer snapshot
                    |
                    v
                 Puck Config
                    +
              Puck view Data
                    |
                    v
          <ViraExperienceStudio />
```

`StudioComponentCatalog`, `StudioDocument`, and `StudioPublication` remain data-only. The renderer registry is executable host/editor integration state and is never serialized.

## Session creation

`createStudioPuckShellSession()` validates the catalog/document/view through the Studio Puck adapter, requires exactly one trusted renderer for every active catalog component, rejects extra/stale renderers, snapshots the functions, and returns:

```ts
{
  config: PuckConfig,
  data: PuckData
}
```

The Puck config is session-local and may contain functions. The Puck data remains serializable editor state.

## Renderer contract

Each trusted renderer receives:

```ts
{
  component: "pegasus.component.button",
  nodeId: "submit",
  props: { ... }
}
```

Puck's special `puck` prop and the editor node `id` are stripped from the brand props. Slot render values supplied by Puck remain in `props` for layout components so trusted renderers can place nested editor content.

The renderer context and props object are shallow-frozen before invocation. The registry itself is not read again after session creation, preventing later caller mutation from swapping renderer functions under an active config.

## React shell

`<ViraExperienceStudio />` is intentionally thin. It delegates visual editing to Puck and exposes Puck `onChange`/`onPublish` events without attempting to mutate the canonical StudioDocument yet.

Canonical drag/drop edits and Puck-generated node-id reconciliation belong to the next composition-session phase. This keeps PR-076 focused on safe executable configuration and editor embedding.

## CSS

The host Studio application must load Puck's published editor stylesheet according to the Puck integration guide. The reusable package does not inject global CSS into an enterprise host application.
