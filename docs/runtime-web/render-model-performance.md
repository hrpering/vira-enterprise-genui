# RenderModel lookup performance

`prepareRenderModel` first validates the Component Adapter through its owning Adapter SDK contract. After that single validation, Runtime Web builds a local immutable-by-scope lookup index from canonical capability IDs to semantic component references.

```text
ComponentAdapter input
  -> createComponentAdapterContract (once)
  -> local Map<capabilityId, componentRef>
  -> ordered composed capabilities
  -> exact lookup per capability
  -> RenderModel
```

The optimization changes no contract semantics. There is no fallback component, fuzzy matching, dynamic loading, or cache shared across requests. An unmapped capability still fails closed at its exact composition path.

The regression suite exercises the Protocol-owned maximum ExperiencePlan capability count rather than relying on wall-clock performance thresholds, which would be environment-dependent and flaky.
