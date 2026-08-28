# Public Web SDK subscriptions

The Web SDK exposes four explicit notification channels:

- `action`: canonical RuntimeAction after successful reducer processing;
- `effect`: each data-only RuntimeEffect returned by Runtime Core;
- `statechange`: the authoritative RuntimeState only when the session revision advanced;
- `error`: the original SDK/event/runtime/session dispatch failure.

For a successful dispatch notification order is deterministic:

```text
action -> effect[0..n] -> statechange (only when changed)
```

Subscriptions are notifications, not execution policy. Receiving a `host-action` effect does not mean Vira executed it. A host may choose what to do with that data outside Runtime Web.

Listener exceptions are contained. They do not modify the dispatch result, stop later listeners, or roll back Runtime Core state. Reentrant `dispatch()` from inside a notification is rejected synchronously before ID allocation so notification/revision order cannot interleave. Subscriptions remain registered across unmount/remount and are cleared permanently when the SDK is disposed.
