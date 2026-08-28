# Runtime Web user event bridge

The user event bridge converts an enterprise-native browser/UI event into a canonical RuntimeAction without allowing adapter configuration to control RuntimeAction identity or source.

Flow:

```text
browser/UI event
  -> Action Adapter exact mapping
  -> semantic { type, payload }
  -> trusted Runtime Web action-ID factory
  -> Runtime Core createRuntimeAction
       source = "user" (fixed)
```

The Action Adapter cannot provide `id`, `source`, permission, or execution behavior. Runtime Web fixes source to `user` for this bridge and obtains an ID from a separately supplied trusted factory. Runtime Core remains the owner of final RuntimeAction validation.

The bridge does not run the reducer, evaluate permissions, execute effects, call tools, or attach DOM listeners. Those are later owning steps.

The ID factory is trusted executable host integration. It is called only after the event and Action Adapter mapping validate successfully. Factory exceptions and invalid returned IDs produce fixed canonical errors without reflecting raw exception text.