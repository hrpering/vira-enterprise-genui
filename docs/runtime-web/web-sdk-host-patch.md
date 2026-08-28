# Public Web SDK host patch

`sdk.patch(patch)` is the explicit host-originated state-update path.

```text
host patch input
  -> Protocol parsePatch
  -> trusted action ID
  -> RuntimeAction(type=runtime.patch.apply, source=host)
  -> Runtime Core permission + reducer
  -> State Binding Session revision/invariant gate
  -> immutable state + data-only effects
```

The host source is fixed by Runtime Web; callers do not provide action `source`, `type`, or `id`. Host origin is not authorization: the configured Runtime Core permission policy may still allow, deny, or require confirmation for `runtime.patch.apply`.

Invalid patches are rejected before action-ID allocation. A permitted patch advances RuntimeState only through Runtime Core patch semantics. A confirmation result keeps state unchanged and returns a `confirmation-required` effect as data. Runtime Web does not execute that effect or rerender the DOM automatically.

The SDK publishes successful host patch actions through the existing `action`, `effect`, and `statechange` notification channels and failures through `error`. Reentrant patch calls made from inside a listener are rejected before ID allocation rather than interleaving state revisions.