# Public Web SDK dispatch

`ViraGenUI.dispatch(event)` is a thin public bridge to the active State Binding Session.

```text
SDK dispatch
  -> active session required
  -> Action Adapter
  -> fixed `source: user` RuntimeAction
  -> Runtime Core permission/reducer
  -> { action, current state, stateChanged, data-only effects }
```

The SDK does not execute returned effects. A `host-action` is a notification that the host may handle in a later subscription/integration layer; `confirmation-required` is likewise data, not implicit approval or execution.

Built-in Runtime Core patches may advance the session state revision. Host-action, confirm, deny, invalid-event, and SDK-precondition paths do not independently mutate state.
