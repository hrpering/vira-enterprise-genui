# Tool Bridge phase gate

The Tool Bridge phase supports three integration surfaces without making provider SDKs part of Vira's core dependency graph:

```text
custom canonical result ----+
                            |
MCP CallToolResult ---------+--> ExternalToolResult --> DomainData
                            |
LangChain ToolMessage ------+
```

MCP and LangChainJS are used as open-source interoperability references, not runtime dependencies. Their transport/runtime metadata is stripped at the bridge boundary.

## OpenAI Responses boundary

The current open-source OpenAI Node Responses types model function-call output as `output: string | [text/image/file content items]` plus call/status metadata. That is useful model-transport data, but it is not a structured domain result contract. Vira therefore does **not** parse JSON-looking output strings into GenUI data.

For an OpenAI-based enterprise agent, the correct integration point is the actual tool/backend result **before** it is serialized into `function_call_output`. That value can enter Vira as a canonical custom result or through a domain-specific adapter. This keeps raw model transport separate from typed GenUI data.

Passing this gate means provider shapes can be normalized without provider coupling, while raw text/model transport never becomes renderer input by inference.
