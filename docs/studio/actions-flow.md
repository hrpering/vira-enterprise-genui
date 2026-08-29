# Studio actions and flow

Studio uses the existing Adapter SDK `ActionAdapterContract` as the exact allowlist of enterprise event aliases available to authors.

For a component event, an author may select one registered action event and optionally route the semantic outcomes `success`, `empty`, and `error` to existing Studio views.

```text
Button.press
   -> flight.search.submit
      success -> results
      empty   -> flexible-dates
      error   -> error
```

Studio never stores an endpoint, HTTP method, callback, retry policy, permission override, tool invocation, or executable workflow step. Runtime Core / Runtime Web still own trusted action identity, source, authorization, effects, and host delivery.

This is intentionally not a general workflow engine: no loops, timers, background tasks, joins, arbitrary branching expressions, or code nodes are introduced.
