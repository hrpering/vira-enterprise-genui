# Tool result to DomainData normalization

Tool Bridge uses an explicit mapping:

```text
{ tool.kind, tool.name }
          |
          | exact match
          v
{ domain, type }
```

There is no selector language, transform callback, default value, component mapping, provider fallback, or fuzzy tool match in this layer.

For `success` and `partial`, the ExternalToolResult JSON payload becomes DomainData `data` unchanged. Tool identity becomes canonical DomainData `source`, and freshness is preserved. The candidate is passed through Protocol `parseDomainData` before it is returned.

For `empty` and `failure`, Tool Bridge returns a typed outcome with the target domain/type and semantic tool/failure metadata. It deliberately does **not** manufacture `data: null`, an empty object, or fake DomainData.

Payload shape transformation remains the responsibility of an explicit customer/domain integration before or after this boundary, not hidden inside provider normalization.