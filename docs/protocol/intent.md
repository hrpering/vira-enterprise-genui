# Intent Protocol v1

Intent is a semantic description of what the host AI, agent, chatbot, rules engine, or application believes the user is trying to accomplish. It is not a UI description and it is not a backend endpoint.

## Contract

```ts
interface Intent {
  version: "1";
  namespace: string;
  name: string;
  confidence?: number;
  parameters?: JsonObject;
}
```

A full semantic key is derived as `namespace + "." + name`.

Example:

```json
{
  "version": "1",
  "namespace": "travel.flight",
  "name": "search",
  "confidence": 0.98,
  "parameters": {
    "origin": "IST",
    "destination": "BER"
  }
}
```

The key for this intent is `travel.flight.search`.

## Identifier rules

- Namespace is lower-case and dot-delimited, for example `travel.flight` or `commerce.product`.
- Namespace segments and the name are 1–63 characters and may use internal hyphens; empty, trailing-hyphen, and repeated-hyphen forms are rejected.
- Name is one lower-case semantic segment, for example `search`, `compare`, or `review-transfer`.
- Confidence, when present, is finite and between `0` and `1` inclusive.
- Parameters contain canonical JSON data only.
- Canonical JSON rejects accessors/getters, class instances, symbols, non-finite numbers, sparse arrays, cycles, and nesting deeper than 64 levels.
- Unknown top-level fields are rejected in v1 so UI/component/backend implementation details cannot silently leak into the canonical intent contract.

## Boundary

Intent validation treats incoming values as data. It must not intentionally execute accessor properties while reading a normal object. Intent must never contain DOM nodes, HTML, CSS, React components, customer endpoints, executable JavaScript, raw tool payloads, or renderer-specific component names.
