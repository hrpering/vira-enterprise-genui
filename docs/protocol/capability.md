# Capability Protocol v1

A Capability identifies a semantic user ability that the system may provide, such as `select-date`, `compare-items`, `display.results-list`, or `confirmation.review-transfer`.

It answers **what the user can semantically do or receive**, not which component should implement it.

## Contract

```ts
interface Capability {
  version: "1";
  id: string;
}
```

## Rules

- `id` uses the shared semantic namespace grammar.
- A simple capability may use one segment such as `select-date`.
- Namespaces may be used when useful, for example `display.results-list`.
- Capability v1 carries no component name, props, layout, styling, endpoint, tool invocation, brand token, or framework detail.
- Adapter/component mapping happens outside this contract.

## Invariant

`capability != component`

Two brands may implement the same `select-date` capability with completely different components while the planner continues to reason about the same semantic capability.
