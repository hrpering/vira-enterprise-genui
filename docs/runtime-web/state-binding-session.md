# Runtime Web state binding session

The state binding session is a small synchronous owner of **one Runtime Core `RuntimeState` reference**.

```text
current RuntimeState
       + UI event
       + fixed normalized policy/action adapter
       -> reduceUserEvent
       -> Runtime Core reducer
       -> same revision + identical state: keep current reference
       -> next revision: atomically replace current reference
```

The session does not copy `plan.state` into another cache. Runtime Core remains the only owner of task-state mutation and revision semantics.

`host-action` and `confirmation-required` results do not advance semantic state, so the session preserves its existing state object for same-revision reductions. A same-revision result containing different semantic state is treated as an invariant violation rather than silently accepted. Denied/invalid events and Runtime Core errors also leave state untouched.

The session does not execute effects, update DOM, perform network calls, or authorize actions itself. Permission evaluation remains inside Runtime Core. Configuration is normalized at creation so later caller mutation of source objects cannot change session behavior.

`dispose()` is local lifecycle only: it prevents additional event processing and does not dispatch a Runtime Core lifecycle action or run cleanup callbacks.
