# Canonical runtime actions

RuntimeAction is the semantic event data model consumed by runtime-core. It describes **what happened or was requested**, not the browser event or backend call that produced it.

## Contract

```ts
interface RuntimeAction {
  id: string;
  type: string;
  source: "user" | "host" | "system";
  payload: JsonObject;
}
```

Examples of semantic action types:

- `location.select`
- `date.select`
- `search.submit`
- `confirmation.accept`
- `experience.close`

## Rules

- `id` is supplied by the caller and is never generated from randomness or wall-clock time by runtime-core.
- `type` uses Protocol's semantic namespace grammar.
- `source` describes semantic provenance, not a DOM element: `user`, `host`, or `system`.
- **`source` is descriptive metadata, never authorization evidence.** A caller declaring `source: "system"` gains no privilege; permission decisions belong to the permission engine and must not trust this field by itself.
- `payload` contains canonical JSON object data and is cloned/frozen during normalization. Missing payload becomes `{}`.
- DOM events (`click`, `change`), component names, CSS selectors, customer endpoints, callbacks, and transport details are not part of this contract.
- RuntimeAction intentionally has no timestamp. Telemetry may timestamp observations separately without making runtime state transitions depend on the clock.

## Boundary

PR-011 only creates validated immutable action data. Dispatch, permission evaluation, state transitions, host execution, effects, retries, and DOM event translation belong to later owning layers.
