# Exact component allowlist

The Security package can authorize resolved component references with an exact, deny-by-default allowlist.

```text
validated component reference
          +
ComponentAllowlistPolicy
          |
          v
     allow / deny
```

Security deliberately does not decide whether a component reference is semantically valid. That remains owned by the Adapter SDK component contract. Security receives a validated bounded key and performs exact membership only.

There is no wildcard, prefix, suffix, regex, fuzzy, namespace inheritance, or implicit same-adapter behavior. An empty allowlist is valid and denies every component.

A component being allowlisted means only that the resolved implementation reference is permitted to render. It does not authorize the semantic capability itself and does not authorize actions emitted by that component. Capability authorization and Runtime Core action permissions remain independent gates.
