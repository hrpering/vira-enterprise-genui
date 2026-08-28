# Adapter SDK Action Adapter

Action Adapter maps enterprise-native UI/event keys to semantic action descriptors without creating or executing RuntimeAction objects.

The output is intentionally limited to:

```ts
{ type: string; payload: JsonObject }
```

`id` and `source` are **not adapter-controlled**. Runtime Web/Core must derive those fields from its trusted event/runtime context before constructing a RuntimeAction. This prevents an adapter mapping from spoofing `source: "system"`, minting trusted action IDs, or bypassing Runtime Core permission checks.

Source event matching is exact and deterministic. Action types are semantic namespaces. Payloads are canonical JSON objects copied from the event input. There are no callbacks, network calls, permission rules, retries, side effects, or hidden action execution in this contract.

Unmapped events fail closed.