# `<vira-experience>` event surface

The element forwards imperative operations directly to Runtime Web:

```text
element.dispatch(uiEvent) -> sdk.dispatch(uiEvent)
element.patch(patch)       -> sdk.patch(patch)
```

It also translates the SDK notification channels into DOM CustomEvents:

| SDK notification | DOM event |
| --- | --- |
| `action` | `vira-action` |
| `effect` | `vira-effect` |
| `statechange` | `vira-statechange` |
| `error` | `vira-error` |

Every event is synchronous, bubbles, crosses shadow boundaries (`composed: true`), is not cancelable, and carries the canonical SDK payload unchanged in `detail`.

A `vira-effect` event is **not effect execution**. The host may observe the returned RuntimeEffect and decide what to do outside the Web Component/Runtime Web boundary.

Because DOM event dispatch happens inside the SDK notification call, Runtime Web's reentrancy guard remains active. If a native listener immediately calls `dispatch()` or `patch()`, the nested operation fails before another action ID can be allocated.

The package still has no module-load dependency on browser globals. The default browser platform supplies the browser CustomEvent factory. An explicitly injected custom-element platform must supply its own `customEventFactory`, and `defineViraExperienceElement()` passes that exact factory into the registered element class. This prevents a registration from succeeding in a non-browser host only to fail later on its first notification.