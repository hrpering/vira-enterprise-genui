# Action flow

Browser/native events, canonical semantic actions and protected enterprise effects are different concepts.

## Canonical shape

```text
Web / iOS / Android event
        ↓
registered Experience interaction
        ↓
canonical runtime action / ActionIntent
        ↓
runtime validation + exact context
        ↓
governance / approval when required
        ↓
Vira Action Boundary
        ↓
trusted action adapter
        ↓
customer backend / enterprise tool
        ↓
ActionReceipt
```

Simple non-protected runtime interactions may terminate inside canonical runtime/host handling, but a protected enterprise side effect never gains authority merely from the renderer, host callback, agent or protocol transport.

## Invariants

- platform events are adapters, not business-action contracts;
- generic runtime/renderers do not hard-code customer endpoints;
- exact tenant/deployment/instance/action context is explicit where required;
- governance/provider errors fail closed for mandatory decisions;
- duplicate/stale protected mutations follow Action Boundary idempotency/revision semantics;
- user and agent proposals converge on the same protected-action boundary;
- replay/telemetry may observe receipts but never re-execute the side effect.
