# React thin wrapper

`@vira-enterprise-genui/react` is intentionally a lifecycle adapter, not another renderer.

```text
<ViraExperience configuration={...} experience={...} />
       |
       | React effect
       v
createViraGenUI(configuration)
       |
       v
sdk.mount(experience)
       |
       v
configured Runtime Web DOM Port
```

The component returns `null`. Runtime Web and the configured trusted DOM Port continue to own actual experience mounting. This prevents React from reimplementing semantic regions, component mapping, accessibility, responsive behavior, reducer semantics, or RuntimeState.

The wrapper does **not** mirror RuntimeState with `useState`. Consumers can observe authoritative changes with `onStateChange` or obtain the exact active Runtime Web SDK using a ref and `ref.current?.getSdk()`.

`configuration` and `experience` are lifecycle identities: if either object identity changes, the current SDK is disposed and a fresh one is created/mounted. Consumers should memoize those values when they intend to preserve the active runtime session. Callback prop changes are read through a ref and do not cause remount.

Runtime effects forwarded to `onEffect` remain data-only notifications. The React wrapper never executes them.