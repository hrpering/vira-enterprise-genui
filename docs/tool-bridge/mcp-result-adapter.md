# MCP `CallToolResult` adapter

The MCP adapter is a structural interoperability boundary, not an MCP runtime.

```text
MCP CallToolResult + canonical tool name
             |
             v
normalizeMcpCallToolResult
             |
             v
ExternalToolResult
```

The official MCP SDK currently models a tool result with `content`, optional object `structuredContent`, and optional `isError`. Vira intentionally does not depend on the SDK package; it accepts the compatible wire/data shape as `unknown` and validates it itself.

Rules:

- `isError: true` -> `outcome: failure`, `failure.code: mcp.tool.error`; raw error content is discarded.
- object `structuredContent` -> `outcome: success`, data is the structured object.
- no structured content + empty `content` -> `outcome: empty`.
- no structured content + non-empty `content` -> adapter failure `UNSTRUCTURED_RESULT`.

The last rule is intentional. Text/media-only MCP results can still be handled by the enterprise chatbot, but Tool Bridge does not pretend they are structured GenUI data or attempt unsafe JSON parsing.

MCP `_meta`, request IDs, transport details, URLs, and arbitrary extension fields are not copied into the canonical envelope.
