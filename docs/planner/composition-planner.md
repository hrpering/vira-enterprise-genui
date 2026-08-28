# Composition Planner

Composition Planner converts a validated ExperiencePlan into semantic priority guidance for the Composer. It does not create regions, layout families, DOM, or components.

## Directive

```ts
interface CompositionDirective {
  planId: string;
  mode: "resolve" | "interact" | "settled";
  primary: Capability[];
  supporting: Capability[];
  deferred: Capability[];
}
```

Priority rules are intentionally small and deterministic:

1. If required capabilities exist, mode is `resolve`; all required capabilities remain primary and available capabilities are supporting.
2. Otherwise, if available capabilities exist, mode is `interact`; the first explicitly ordered available capability is primary and the remainder are supporting.
3. Otherwise mode is `settled`.
4. Future capabilities are always deferred.

The order is inherited from the already validated ExperiencePlan; Composition Planner does not rank with a model or hidden score.

## Boundary

This directive tells Composer what deserves semantic priority, not how it should be laid out. Semantic regions, layout/disclosure policies, responsive behavior, components, actions, brand styling, DOM, and network behavior belong to later owning layers.
