# Adapter SDK Intent Adapter

Intent Adapter maps enterprise-native intent keys to canonical Vira Intent values through exact deterministic aliases.

A customer system may emit keys such as `BOOK_FLIGHT`, `flight_search_v2`, or another bounded string. The adapter contract maps each exact source key to one canonical `{ namespace, name }` target owned by Intent Protocol.

No regex, glob, fuzzy matching, embedding search, model call, hidden priority, or fallback inference is allowed in this MVP contract. Unmapped source keys fail closed.

Optional `confidence` and `parameters` are passed through only after Protocol validation. Confidence is descriptive metadata and never grants runtime/tool/network permission.

The adapter contains no prompt, provider, endpoint, credential, tool execution, component, layout, or runtime-state behavior.