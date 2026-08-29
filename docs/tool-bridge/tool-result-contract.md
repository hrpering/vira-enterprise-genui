# Provider-neutral external tool result

Tool Bridge first converts external tool output into one small provider-neutral envelope. Provider SDK objects, HTTP response objects, credentials, endpoints, opaque call IDs, exception messages, and stacks are not part of this contract.

```text
external tool integration
        |
        v
ExternalToolResult
  version
  tool.kind + tool.name
  outcome
  data?       (canonical JSON)
  failure?    (semantic code only)
  freshness?
        |
        v
future DomainData normalization
```

Outcomes are explicit:

- `success`: canonical JSON `data` is required; `failure` is forbidden.
- `partial`: canonical JSON `data` is required; a semantic `failure.code` may explain incompleteness.
- `empty`: `data` and `failure` are both forbidden.
- `failure`: `data` is forbidden and semantic `failure.code` is required.

The entire input first passes Protocol's getter-safe canonical JSON parser. Accessors are rejected without invocation. The normalized result is detached and deeply frozen before it leaves Tool Bridge.