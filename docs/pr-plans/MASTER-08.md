# MASTER-08 — Protected Action Boundary

## Responsibility

Create the single governed execution boundary between a canonical Vira runtime action and any Host-owned external side effect.

MASTER-08 does **not** create a new policy language, transport, renderer, workflow engine, or Host implementation. It composes existing canonical Runtime Core permission semantics with an exact action catalog and a single-use execution permit.

```text
Runtime action proposal
        ↓
exact instance/action validation
        ↓
action catalog classification
        ↓
canonical permission decision
        ↓
allow | deny | confirm
        ↓
single-use execution permit
        ↓
Host / protected effect executor
```

## Existing ownership preserved

- `runtime-core` remains the permission-policy authority (`allow | deny | confirm`, default deny).
- `studio-runtime` remains the canonical UI event → runtime action authority.
- `studio-host-runtime` remains Host transport, monotonic snapshot, completion, and existing action-id forward protection.
- Web/iOS/Android remain rendering/platform adapters.

MASTER-08 introduces only the protected execution authority.

## Invariants

1. **Exact instance ownership** — a boundary is created for one bounded `instanceId`; proposals for any other instance fail closed.
2. **Catalog-owned effect classification** — the caller/agent cannot self-declare an action safer than the registered catalog definition.
3. **Canonical action identity** — every proposal has one exact bounded `actionId` and semantic `actionType`.
4. **Canonical JSON payload** — payloads are inspected through protocol canonical JSON validation before policy or execution.
5. **Default deny** — missing permission rule never becomes implicit allow.
6. **Confirmation is not allow** — `confirm` produces a challenge. Execution requires a matching, unconsumed confirmation grant for the exact instance/action/actionType.
7. **Single-use execution** — an action id can cross the protected external-effect boundary at most once per boundary instance.
8. **Reserve before effect** — the action id is reserved before awaiting the executor; transport uncertainty can never cause replay of the same action id.
9. **Definition immutability** — action catalog definitions are validated, copied, frozen, unique by `actionType`, and bounded.
10. **No local Runtime Core built-in diversion** — exact local Runtime Core actions remain locally reduced by platform/runtime sessions. MASTER-08 is for Host/protected external actions.
11. **No platform fork** — boundary semantics are platform-neutral TypeScript contracts used by Web/iOS/Android Host integration.
12. **No secret material** — confirmation grants and execution permits are identifiers/claims, not credentials or backend secrets.

## V1 action catalog

Each action type is registered with:

- `actionType`
- `effect`: `read | write | irreversible`
- `idempotency`: `none | action-id`

The effect class is descriptive/governance metadata owned by trusted product configuration. Permission remains canonical Runtime Core policy.

`write` and `irreversible` actions MUST use `action-id` idempotency. `read` actions may use either mode, but the protected boundary still refuses duplicate execution of the same proposal action id.

## Confirmation grant

A grant is exact and single-purpose:

```text
version: 1
instanceId
 actionId
 actionType
```

It can satisfy only the challenge for the same proposal. It does not alter the permission policy and cannot authorize another action.

## Execution semantics

`execute(proposal, executor, confirmation?)`:

1. validate proposal;
2. resolve exact catalog definition;
3. evaluate canonical Runtime Core action permission;
4. deny → fail closed, no reservation, no executor call;
5. confirm without exact grant → return confirmation-required, no reservation, no executor call;
6. allow / confirmed → atomically reserve action id;
7. invoke executor with frozen permit + action data;
8. success → terminal success;
9. executor throws/rejects → terminal uncertain failure; reservation remains consumed.

The boundary never retries an external effect automatically.

## Out of scope

- Rego/Cedar/policy language adapters
- enterprise approval workflows
- durable distributed idempotency store
- audit persistence / evidence ledger
- compensation / saga semantics
- connector credential handling
- action-specific backend clients

Those layers may consume MASTER-08 later; they must not bypass it.

## Acceptance / final CI gate

Implementation work may stack without hosted CI. Final verification is intentionally deferred until the complete master-plan stack is ready for the user's local CI run.

Before merge of the stack, final verification must prove:

- repository typecheck/lint/tests/build;
- protected action boundary contract tests;
- default-deny and exact confirmation tests;
- duplicate/replay tests including uncertain executor failure;
- instance mismatch and forged payload tests;
- Web/iOS/Android native regression gates;
- diff/boundary hygiene.
