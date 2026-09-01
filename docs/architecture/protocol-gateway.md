# Protocol Gateway

Protocol Gateway is a provider-neutral dispatch façade over external-protocol normalizers already owned by `@vira-enterprise-genui/tool-bridge`.

It does not own MCP or LangChain wire schemas and it does not create a second Vira protocol.

```text
external provider result
       ↓
Protocol Gateway
       ↓
closed dispatch
       ├─ mcp       → tool-bridge MCP normalizer
       └─ langchain → tool-bridge LangChain normalizer
       ↓
canonical ExternalToolResult
```

## Ownership

`tool-bridge` remains the canonical owner of provider-specific normalization and of the final `ExternalToolResult` validation boundary. Gateway only selects the existing adapter from a closed protocol allowlist.

The wrapper accepts exactly `protocol`, `toolName`, and `payload`. Successful calls return the existing canonical `ExternalToolResult` directly, with no Gateway envelope or provider metadata.

## Error boundary

Gateway errors deliberately do not expose provider-specific nested paths or messages. Invalid tool identity is normalized to `$.toolName`; all other provider-result failures are normalized to `$.payload`. Wrapper unknown fields are rejected without reflecting the rejected property name.

## Transport boundary

PGW-001 has no JSON-RPC, HTTP, SSE, WebSocket, MCP client/server lifecycle, sessions, authentication, discovery, or tool invocation. Those are transport/runtime concerns and are not required to normalize a provider result that has already been produced.

## Extensibility

A new external protocol can be added only after an owning adapter exists that converts it into the canonical tool-bridge result contract. Gateway itself must never become a general wire-protocol parser.
