# Runtime reducer

The runtime reducer is the strict public orchestration boundary for RuntimeState transitions and data-only effects.

```text
state input + action input + policy input
  -> strict normalize RuntimeState
  -> strict normalize RuntimeAction
  -> strict normalize permission policy
  -> evaluate permission
  -> deny: canonical RuntimeError
  -> confirm/allow: pure lifecycle/payload preflight
  -> confirm: normalized unchanged state + confirmation-required effect
  -> allow:
       runtime.patch.apply          -> patch engine -> new state
       runtime.lifecycle.transition -> lifecycle engine -> new state
       other semantic action        -> unchanged state + host-action effect
```

The reducer never performs a host action, network request, DOM operation, timer, retry, or callback. Effects are frozen data for an owning host layer to interpret later.

## Public-boundary normalization

Reducer inputs are `unknown` at runtime. State, action, and policy are all revalidated/normalized even if a TypeScript caller previously created them through runtime-core. Invalid/forged/mutable state cannot produce host or confirmation effects.

## Built-in actions

`runtime.patch.apply` payload must contain exactly one `patch` field. Patch syntax is preflighted before confirmation/effect decisions, then the patch engine applies it only after explicit allow. Plan mutation is rejected once lifecycle is terminal.

`runtime.lifecycle.transition` payload must contain exactly one `target` field. Transition viability is preflighted before confirmation; the lifecycle engine performs the immutable transition only after explicit allow.

Both built-ins require explicit permission rules. `source: "system"` does not bypass permission.

## Effects

- `host-action`: an allowed semantic action the host may interpret/execute outside runtime-core.
- `confirmation-required`: a confirm-gated, preflight-valid action that has **not** been executed and has not changed semantic state.

Terminal runtimes do not emit generic host-action effects. Confirmation must later re-enter an authorized reducer path; the effect itself is not authorization.
