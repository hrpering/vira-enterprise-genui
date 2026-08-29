# Studio AI-assisted authoring

AI-assisted authoring is an optional draft generator, not a runtime planner and not a publisher.

```text
host prompt + fixed experience identity
        +
active brand component catalog
approved binding source catalog
approved Action Adapter event aliases
        |
        v
host-owned Studio AI provider
        |
        v
candidate StudioDocument
        |
component / binding / action / flow validation
        |
        v
validated draft opened for human editing/preview
```

The provider receives only the authoring vocabulary it needs: serializable component metadata, exact binding sources, exact action **event aliases**, optional validated base document, and the host-fixed experience/recipe identity. It does not receive endpoints, callbacks, permission policy, RuntimeAction source/id factories, renderer functions, network rules, or publish authority.

The provider is a host-owned `generate(request)` port so Vira is model/provider neutral. There are no hidden retries, provider SDKs, model names, credentials, network calls, or prompt persistence in the Studio package.

Generated output is only a candidate `StudioDocument`. It must pass the same catalog/binding/action/flow gates as hand-authored documents. Identity changes fail closed. No AI output is automatically published.
