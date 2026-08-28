# Runtime permissions

Runtime permissions provide a small deterministic policy layer for semantic actions and capabilities.

## v1 policy

```ts
interface RuntimePermissionPolicy {
  version: "1";
  rules: Array<{
    subject: "action" | "capability";
    id: string;
    effect: "allow" | "deny" | "confirm";
  }>;
}
```

Rules match exact semantic identifiers only. v1 has no wildcards, callbacks, expressions, source conditions, roles, endpoint conditions, or customer code execution.

If no exact rule matches, the decision is `deny`.

## Effects

- `allow`: the permission layer permits the semantic action/capability.
- `deny`: the permission layer rejects it.
- `confirm`: the operation is not yet allowed; an owning reducer/host flow must obtain explicit confirmation before any execution path is chosen.

`confirm` must never be treated as `allow`.

## Security invariants

- `RuntimeAction.source` is descriptive provenance only. `source: "system"` or `source: "host"` grants no privilege.
- Policy decisions are exact-match and default-deny.
- Permission policy is data only and cannot contain callbacks or executable predicates.
- This layer makes no network/backend call and does not perform the action.
- Direct low-level patch/lifecycle primitives remain authorization-agnostic; reducer orchestration is responsible for evaluating permission before choosing a privileged transition/effect.
