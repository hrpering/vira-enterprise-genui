# Deterministic tool freshness evaluation

Tool Bridge classifies freshness but does not decide what the product should do with that classification.

```text
ExternalToolResult + explicit nowUnixMs
                  |
                  v
       evaluate freshness
                  |
        +---------+---------+---------+
        |         |         |         |
     unknown    future     fresh     stale
```

Rules are deterministic:

- no freshness metadata -> `unknown`
- `nowUnixMs < observedAtUnixMs` -> `future`
- expiry exists and `nowUnixMs >= expiresAtUnixMs` -> `stale`
- otherwise -> `fresh`

There is deliberately no `Date.now()` call. The enterprise host supplies `nowUnixMs`, so tests, replay, server/client coordination, and policy layers can choose their own trusted clock source.

`stale`, `future`, and `unknown` are observations, not authorization or execution decisions. Tool Bridge does not retry a tool, refresh data, evict a cache entry, hide UI, or reject an experience based on these statuses.
