# `<vira-experience>` element shell

The Web Component package is intentionally thin:

```text
<vira-experience>
      |
      | configure / mount / unmount
      v
Runtime Web public SDK (`createViraGenUI`)
```

The element does not implement planner/composer/runtime behavior and does not interpret semantic component references itself. Runtime Web remains the implementation owner.

Complex configuration is passed through JavaScript via `configure(...)`; it is not encoded into HTML attributes. This avoids turning adapter contracts, policies, DOM ports, or action-ID factories into stringly-typed markup.

`disconnectedCallback()` unmounts the active experience so host DOM/resources are released when the element leaves the document. The normalized SDK configuration is retained, so the host may mount again later. `dispose()` is explicit, permanent, and idempotent.

The module is safe to import outside a browser. Browser globals are resolved only when `defineViraExperienceElement()` is invoked without an injected platform.