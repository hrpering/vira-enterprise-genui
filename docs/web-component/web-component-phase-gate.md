# Web Component phase gate

The Web Component phase gate verifies that `<vira-experience>` remains a standards-native shell over Runtime Web rather than a second GenUI implementation.

```text
customElements registry
  -> <vira-experience>
  -> configure(Runtime Web SDK configuration)
  -> mount(experience)
  -> Runtime Web mount/state ownership

user interaction -> element.dispatch -> Runtime Web SDK
host update      -> element.patch    -> Runtime Web SDK

Runtime Web notification
  -> element CustomEvent
  -> vira-action / vira-effect / vira-statechange / vira-error
```

The gate explicitly verifies disconnect cleanup and remount: removing the element unmounts the active experience, but retained normalized configuration can mount a fresh RuntimeState later. Explicit `dispose()` remains permanent.

Passing this gate means the element does not own planning, composition, permissions, reducer semantics, RuntimeState mutation, or effect execution.