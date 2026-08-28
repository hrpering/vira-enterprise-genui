# Adapter SDK Data Adapter

Data Adapter projects already-canonical DomainData into a small semantic JSON object through explicit top-level field bindings.

A contract declares one exact DomainData `{ domain, type }` source plus one-to-one `{ from, to }` bindings. `from` and `to` are semantic top-level field names. The adapter performs no nested path traversal, expression evaluation, transform callbacks, raw API parsing, or business inference.

Example:

```text
DomainData.data
{ departure: "IST", arrival: "BER" }

bindings
[{ from: "departure", to: "origin" }, { from: "arrival", to: "destination" }]

projection
{ origin: "IST", destination: "BER" }
```

Every declared source field is required. A missing field, wrong domain/type, non-object DomainData payload, duplicate source/target binding, or unlisted contract shape fails closed.

The output is canonical data only. It may later be used by an owning planner/component integration, but this adapter does not mutate RuntimeState or render components.