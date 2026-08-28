# Runtime error taxonomy

Runtime errors are frozen serializable data owned by runtime-core. They are not thrown JavaScript `Error` objects and do not carry raw exception stacks, causes, timestamps, HTTP status codes, arbitrary detail payloads, or caller-controlled diagnostic messages.

## Shape

```ts
interface RuntimeError {
  version: "1";
  code: RuntimeErrorCode;
  category: "validation" | "state" | "permission" | "conflict" | "internal";
  message: string;
  path?: string;
}
```

Both `category` and `message` are derived from the canonical error code. Callers supply only `code` and, optionally, a bounded diagnostic `path`.

Current runtime-core codes cover invalid state/action/patch data, rejected patches, illegal lifecycle transitions, permission denial/confirmation requirements, revision overflow, unhandled actions, and internal invariant failures.

## Boundaries

- Canonical errors cannot carry caller-provided message text, preventing accidental PII/token/raw-exception leakage through the error envelope.
- `message` is fixed diagnostic text derived from `code`, not trusted HTML and not automatically user-facing copy.
- `path` is optional bounded diagnostic location text.
- Raw exceptions/stacks/cause objects are not part of the canonical error.
- Runtime-core does not claim ownership of planner, composer, adapter, renderer, or security package errors. Those packages define/map their own errors at their boundaries.
- Telemetry may observe a RuntimeError later, but timestamping belongs to telemetry rather than the deterministic runtime error value.
