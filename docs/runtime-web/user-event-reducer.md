# Runtime Web user event reducer bridge

The reducer bridge composes two already-owned boundaries:

```text
UI event
  -> Runtime Web user event bridge
  -> canonical RuntimeAction(source=user)
  -> Runtime Core reduceRuntime(state, action, permissionPolicy)
  -> immutable new state + data-only effects OR canonical RuntimeError
```

It does not execute any returned effect. `host-action` and `confirmation-required` remain data for an owning host/session layer.

Permission evaluation stays inside Runtime Core. Runtime Web does not duplicate allow/deny/confirm logic and does not grant privilege based on action source, component, or event name.

On event-bridge failure the ID/reducer path stops. On reducer rejection, the created action may have consumed an ID, but no effect is executed by this bridge.