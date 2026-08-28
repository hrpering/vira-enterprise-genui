# Adapter SDK Component Adapter

Component Adapter maps canonical Capability identities to semantic component references without carrying a component implementation.

Example:

```text
Capability: select-date
        ->
component ref: acme.component.date-picker
```

A component reference is a namespaced semantic identifier only. It is not a React/Vue component, JavaScript function, import path, package URL, HTML tag, custom-element name, template, or props object. Runtime Web/framework wrappers later resolve approved semantic references to concrete host components.

Mapping is exact and deterministic. An unmapped Capability fails closed. Multiple capabilities may intentionally point to the same semantic component reference, but one capability may have only one mapping in a contract.

This contract does not grant runtime permission and does not execute components.