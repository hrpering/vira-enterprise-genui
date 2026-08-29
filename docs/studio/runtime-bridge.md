# Studio runtime bridge

The Studio runtime bridge is the optional seam between a validated `StudioPublication` and the existing Vira Runtime Web action/permission machinery. It does not widen `ExperiencePlan` and does not modify Runtime Core or Runtime Web.

## Runtime path

```text
StudioPublication
   -> resolve current Studio view
   -> exact host data port bindings
   -> data-only component view model

component event
   -> published Studio interaction
   -> Action Adapter event alias
   -> Runtime Web createStateBindingSession
   -> Runtime Core permission/reduction
   -> host-action effect

host result
   -> optional canonical host patch
   -> success | empty | error
   -> published Studio route
   -> next view
```

The bridge allows one pending Studio action at a time in MVP. Host outcome completion must carry the exact RuntimeAction id returned by dispatch, preventing stale results from transitioning a newer action.

Data binding uses a trusted host-owned `data.read(source)` port. Returned values are canonical-JSON parsed and checked against the target component prop descriptor before entering the view model. The port cannot add components, actions, routes, endpoints, or permissions.

A publication is not trusted merely because it has the right TypeScript shape: the bridge rebuilds it from its embedded document through the publish gate and rejects semantic differences as forged publication data.
