# DomainData Protocol v1

DomainData is normalized application/domain information that may influence planning and rendering after crossing an explicit adapter or tool-normalization boundary. It is not a raw customer API response.

## Contract

```ts
interface DomainData {
  version: "1";
  domain: string;
  type: string;
  data: JsonValue;
  source?: {
    kind: string;
    name?: string;
  };
  freshness?: {
    observedAtUnixMs: number;
    expiresAtUnixMs?: number;
  };
}
```

Example key: `travel.flight.search-results`.

## Rules

- `domain` uses the same semantic namespace grammar as Intent.
- `type` uses the shared semantic segment grammar.
- `data` is canonical JSON and is cloned during normalization; raw SDK/API objects are not retained.
- `source.kind` is semantic metadata such as `host`, `tool`, `api`, `cache`, or `derived`; the protocol does not hard-code a provider list.
- `source.name`, when present, is a semantic namespace such as `flight-search` or `inventory.pricing`. It is not an endpoint, credential, token, opaque call ID, or executable instruction.
- Freshness timestamps are explicit non-negative Unix epoch milliseconds; `expiresAtUnixMs`, when present, cannot precede `observedAtUnixMs`.
- Freshness is descriptive metadata only. Fetching, cache invalidation, retries, and business-side expiry behavior remain host responsibilities.
- Unknown fields are rejected in v1.

## Boundary

Customer-specific response mapping belongs in a domain adapter or tool bridge. DomainData must not contain DOM nodes, framework components, executable JavaScript, authentication secrets, transport clients, or arbitrary class instances.
