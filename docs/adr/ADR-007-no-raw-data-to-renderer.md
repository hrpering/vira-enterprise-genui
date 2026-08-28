# ADR-007: No raw external data reaches renderers

**Status:** Accepted

Raw LLM output, tool output, and arbitrary customer API payloads must be normalized and validated before they can influence rendering. Runtime-web is not a parser for arbitrary external payloads.
