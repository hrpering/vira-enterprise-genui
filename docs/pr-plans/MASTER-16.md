# MASTER-16 — Protocol Gateway v2

## Responsibility

Extend the existing protocol gateway without creating a Vira-specific protocol island or collapsing distinct external protocol semantics into one fake common model.

```text
Inbound source
   │
   ├── AG-UI      → transport / state / events
   ├── A2UI       → declarative UI interoperability
   ├── MCP        → tool / data / action discovery
   ├── MCP Apps   → sandboxed web compatibility surface
   ├── Vira Native→ canonical native publication
   └── Custom JSON→ explicitly custom JSON ingress
             │
             ▼
      canonical JSON boundary
             │
             ▼
      semantic ingress envelope
```

## Invariants

1. Existing protocol-gateway v1 remains the canonical MCP/LangChain tool-result normalization path and continues delegating to `tool-bridge`.
2. MASTER-16 v2 adds protocol semantic classification; it does not replace v1 tool-result normalization.
3. AG-UI is classified as transport/state/event integration, not UI schema ownership.
4. A2UI is classified as declarative UI interoperability and requires an explicit compatible catalog for native rendering.
5. MCP is classified as tool/data/action discovery, not a UI renderer.
6. MCP Apps is a sandboxed web compatibility surface and is always marked `never-auto-convert` for native strategy.
7. Vira Native is the canonical native-publication path.
8. Custom JSON remains explicitly custom and receives no invented semantics.
9. HTML/MCP Apps is never automatically translated into SwiftUI, Compose or another native renderer.
10. Protocol payloads cross the existing canonical JSON boundary before entering Vira-owned state.
11. Root ingress fields must be exact enumerable own-data properties; accessor/symbol-backed inputs fail closed.
12. Protocol semantics are metadata only; MASTER-16 does not grant action execution, publish, policy override or secret access.
13. No remote Swift/Kotlin/JS, WebView-as-native claim, React Native substitution or arbitrary generated code is introduced.
14. Protocol-specific adapters may be added later, but they must preserve these semantic roles rather than collapsing protocols together.

## RE/QC findings closed

- the existing gateway already owns MCP/LangChain canonical tool-result normalization, so v2 is additive instead of rewriting that authority;
- an older MASTER-16 branch inherited obsolete MASTER-14/15 experiments and is being clean-ported from authoritative MASTER-15;
- the initial stale v2 used mutable ambient array helpers; the clean implementation follows existing gateway captured-intrinsic/fail-closed inspection style;
- MCP Apps is explicitly modeled as web compatibility with native auto-conversion forbidden;
- A2UI native use is modeled as catalog-required rather than implying generic HTML/native conversion;
- ingress payloads are canonicalized through `parseJsonValue()` before semantic metadata is emitted.

## Verification policy

Hosted CI is deferred. Final local/full CI must cover v1 regression compatibility, all six v2 semantic mappings, MCP Apps native-conversion denial, A2UI catalog-required metadata, hostile accessor/symbol roots, canonical JSON payload rejection and package-boundary hygiene.
