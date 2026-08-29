# LangChainJS `ToolMessage` adapter

The adapter follows a useful separation in the open-source LangChainJS `ToolMessage` design: model-facing `content` and optional full execution `artifact` are distinct, while `status` can indicate success or error.

Vira does not depend on LangChainJS. It reads only the compatible data surface required for normalization.

```text
ToolMessage-compatible object + canonical tool name
                       |
                       v
       normalizeLangChainToolMessage
                       |
                       v
              ExternalToolResult
```

Rules:

- `status: "error"` -> canonical failure `langchain.tool.error`; content/artifact/metadata/call IDs are discarded.
- success + canonical JSON artifact -> artifact becomes canonical tool data.
- success + no artifact + empty content -> canonical `empty`.
- success + no artifact + non-empty content -> `UNSTRUCTURED_RESULT`.
- omitted status is treated as success for compatibility with older/optional-status ToolMessage values.

The adapter deliberately does not parse text content as JSON. The existing enterprise chatbot may still consume model-facing ToolMessage content, while Vira's GenUI path requires an explicit structured artifact.
