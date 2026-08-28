# Runtime Web core phase gate

The Runtime Web phase gate verifies the framework-neutral browser-runtime boundary assembled so far:

```text
ExperiencePlan + ComposedExperience + Component Adapter
  -> source-plan integrity
  -> RenderModel
  -> Accessibility Policy
  -> Container Responsive Policy + measurement
  -> transactional trusted DOM Port mount

UI event
  -> fixed-user RuntimeAction
  -> Runtime Core permission/reducer
  -> State Binding Session
  -> immutable current RuntimeState + data-only effects
```

The golden integration deliberately does not execute `host-action` or `confirmation-required` effects. It also does not provide a concrete browser DOM implementation; the DOM Port remains the trusted host integration boundary for the next SDK/wrapper layers.

Passing this gate means Runtime Web core semantics are locked: source-plan integrity, exact component references, transactional mounting, explicit accessibility/container context, fixed user-event identity ownership, Runtime Core permission/state ownership, and idempotent disposal.
