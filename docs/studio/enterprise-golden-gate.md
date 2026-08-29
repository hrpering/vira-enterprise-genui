# Studio enterprise golden gate

The enterprise golden gate closes the planned Studio stack with one Pegasus-style experience that crosses the public authoring and runtime seams without adding production behavior.

```text
AI-assisted draft (optional authoring input)
  -> validated StudioDocument
  -> nested Puck export / canonical reconcile
  -> explicit data binding
  -> approved action event + outcome routes
  -> preview/publish gate
  -> immutable StudioPublication
  -> Studio runtime bridge
  -> existing Runtime Web action/permission session
  -> correlated host outcome
  -> next Studio view with trusted binding resolution
```

The deny matrix proves that an unregistered visual component cannot enter canonical authoring, an unregistered binding source cannot be selected, an unregistered action alias cannot be bound, a forged publication cannot create a Studio runtime session, and a stale host outcome cannot transition the active view.

The gate does not claim CI success by existing as source code. The Studio stack is code-complete only; release readiness still requires the repository `pnpm verify` gate to execute successfully in a trusted runner/environment.
