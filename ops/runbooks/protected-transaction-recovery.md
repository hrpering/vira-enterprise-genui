# Protected transaction recovery

When uncertain protected executions rise, do not retry the provider action automatically.

1. Freeze automated replay for the affected exact tenant, provider, Action version, and effect epoch.
2. Inspect signed request, outbox, lease, provider observation, postcondition, and Action Ledger evidence.
3. Redact credentials and user identifiers before attaching diagnostics.
4. Classify the outcome as verified-success, verified-failure, or uncertain; never coerce uncertain to success.
5. Use the semantic owner's recovery path. Provider/action bypasses and direct database mutations are forbidden.
6. Record recovery evidence and a bounded incident reference before resuming the queue.
