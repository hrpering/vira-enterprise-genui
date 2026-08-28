# Public `createViraGenUI` instance

The first public SDK instance is intentionally single-active-experience.

```text
createViraGenUI(config)
  -> normalized WebSdkConfiguration

sdk.mount({ experienceId, plan, composition })
  -> create RuntimeState (normalizes source ExperiencePlan)
  -> create State Binding Session
  -> validate/render + transactional DOM mount
  -> active { session, mounted }
```

The normalized `RuntimeState.plan` is passed into the mount integrity boundary, so SDK mount does not create a second semantic plan truth.

Mount is atomic at SDK level. If state/session preparation fails, the DOM Port is untouched. If declarative render validation or DOM host mounting fails, the provisional session is disposed and the SDK remains unmounted. Detached/forged composition is reported separately from a trusted DOM host/measurement failure.

The SDK does not yet expose event dispatch or execute Runtime Core effects. `unmount()` disposes the state-binding session before DOM cleanup and allows a later mount. `dispose()` is permanent and idempotent.
