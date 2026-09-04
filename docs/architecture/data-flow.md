# Data flow

External model, tool, provider and customer data must cross an explicit normalization/validation boundary before it can influence canonical application semantics, rendering or protected actions.

```text
LLM / tool / customer API / protocol payload
        ↓
normalizer / adapter / canonical parser
        ↓
validated canonical data
        ├──> planning / composition
        ├──> Studio bindings / publication
        ├──> Work/runtime state
        └──> bounded action payload
                 ↓
        trusted registered renderer
        or governance + Action Boundary
```

## Invariants

- a renderer never interprets arbitrary raw model/tool/customer payloads as authority;
- protocol/provider metadata is not canonical authority merely because it was received from a trusted transport;
- canonical parsers grant trust only for the semantics they own;
- Experience/Studio artifacts remain passive bounded data, not executable code delivery;
- secrets stay behind trusted server/control-plane adapters and do not travel through client semantic artifacts;
- protected action payloads are revalidated at their owning boundary even if upstream Experience data was valid;
- Web, iOS and Android consume equivalent validated semantics rather than platform-specific raw payload formats.
