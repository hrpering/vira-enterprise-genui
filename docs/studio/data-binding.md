# Studio data binding

Studio data binding is explicit selection, not an expression language.

An enterprise registers a bounded source catalog such as:

```text
domain: travel.flight.results   -> enum/string/number/boolean metadata
state:  search.disabled
```

Studio then exposes only compatible sources for bindable component props. A user cannot type arbitrary JSONPath, JavaScript, URL, API endpoint, transform, callback, or expression.

`setStudioBinding()` removes a static value for the selected prop before adding the canonical binding, preventing two competing sources of truth. `clearStudioBinding()` is transactional: if removing a binding would make a required component prop invalid, the operation fails closed.

The source catalog is authoring metadata, not runtime authorization. Runtime/publish gates must still validate that the host actually provides and authorizes referenced data.
