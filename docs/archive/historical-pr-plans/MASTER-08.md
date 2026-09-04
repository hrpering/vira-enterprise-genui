# MASTER-08 — Vira Action Boundary

## Responsibility

Own the single governed execution boundary between a canonical Vira user/agent action and any Host/connector-owned enterprise side effect.

```text
UI Action / Agent Action
          ↓
      ActionIntent
          ↓
       Validation
          ↓
   Exact instance/action identity
          ↓
        Policy
          ↓
       Approval
          ↓
 Revision + idempotency
          ↓
 Trusted action adapter
          ↓
     ActionReceipt
```

MASTER-08 does **not** create a new policy language, Host transport, renderer, workflow engine, connector credential system, or business-rule engine.

## Existing ownership preserved

- `runtime-core` remains the canonical permission authority for `allow | deny | confirm` and default-deny behavior.
- `studio-runtime` remains the UI event → canonical runtime action authority.
- `studio-host-runtime` remains Host transport, monotonic Host snapshots, completion, and its existing action-forward protection.
- Web/iOS/Android remain platform/rendering adapters.
- `action-boundary` owns protected external-effect admission and execution identity.

Transport and governance remain separate authorities.

## Canonical ActionIntent

A protected side effect is proposed with:

```text
version
instanceId
expectedStateRevision
idempotencyKey
action
  ├── id
  ├── type
  ├── source
  └── payload
```

The caller cannot omit or self-correct revision/idempotency metadata after policy evaluation.

## Trusted action catalog

Each allowed external action type is registered by trusted product configuration:

```text
actionType
effect       = read | write | irreversible
idempotency  = none | action-id
```

Rules:

- action types are exact, semantic, unique and bounded;
- exact local Runtime Core built-ins (`runtime.patch.apply`, `runtime.lifecycle.transition`) cannot be diverted into this external boundary;
- `write` and `irreversible` require `action-id` idempotency;
- callers/agents cannot downgrade an action from irreversible/write to read.

## Policy and approval

MASTER-08 reuses canonical Runtime Core permission semantics:

```text
allow
  → continue

deny
  → fail closed

confirm
  → exact confirmation challenge
  → exact matching grant required
```

A confirmation grant is bound to all of:

```text
instanceId
actionId
actionType
expectedStateRevision
idempotencyKey
```

Confirmation never mutates policy and cannot authorize a different action or revision.

## Revision ownership

The boundary receives a trusted `revisionProvider`.

Requirements:

- revision is a non-negative safe integer;
- provider revisions may not regress;
- `ActionIntent.expectedStateRevision` must exactly equal current trusted revision;
- stale intents fail before any execution identity is consumed;
- only one **effectful** (`write | irreversible`) ActionIntent may own a given revision at a time;
- a second different effectful action from the same revision fails with `REVISION_CONFLICT`;
- read actions do not reserve effect revision ownership;
- revision ownership is released only after a trusted deterministic no-effect result at the same revision, or once the trusted revision advances.

This prevents two different writes generated from the same stale state from crossing concurrently.

## Idempotency and replay safety

Two independent execution identities are protected:

```text
actionId
idempotencyKey
```

Both are synchronously reserved before the trusted adapter is invoked or awaited.

Therefore:

- double click with same action id → reject;
- retry with new action id but same idempotency key → reject;
- concurrent duplicate → only one can cross;
- transport/adapter exception after the boundary is crossed → action/key remain consumed because the external side effect is uncertain;
- the boundary does not automatically retry external effects.

This is an **at-most-once crossing guarantee for one boundary instance**, not a claim of distributed exactly-once execution. Durable/distributed idempotency belongs to a later storage/deployment integration layer.

## Trusted action adapter

After all checks, the adapter receives a frozen permit containing:

```text
instanceId
actionId
actionType
effect
idempotency
expectedStateRevision
idempotencyKey
```

The adapter returns canonical:

```text
outcome       = success | empty | error
stateRevision
data?         = canonical JSON object
```

For a successful `write | irreversible` action, observed `stateRevision` must advance beyond `expectedStateRevision`.

Malformed or contradictory adapter results fail closed. Execution identities remain consumed because the boundary has already crossed into an external effect authority.

## ActionReceipt

A valid adapter result is normalized into immutable `ActionReceipt`:

```text
version
instanceId
actionId
actionType
effect
idempotencyKey
expectedStateRevision
observedStateRevision
outcome
data?
```

This receipt is the semantic handoff for later MASTER-17 observability/replay/ledger work. MASTER-08 does not persist the receipt itself.

## Core invariants

1. Every enterprise side effect crosses Action Boundary.
2. Exact instance ownership is mandatory.
3. Action registration is trusted configuration, never agent-selected authority.
4. Payload/action identity is canonical before policy evaluation.
5. Missing permission rule is deny.
6. Confirmation is not implicit allow.
7. Stale revision is rejected before execution.
8. Effectful revision ownership is atomic before await.
9. Action id and idempotency key are reserved before await.
10. Uncertain external failure never causes automatic replay.
11. ActionReceipt is produced only from a valid trusted adapter result.
12. No platform-specific Action Boundary fork.
13. No backend secrets enter ActionIntent, permit, challenge, or receipt.
14. No claim of distributed exactly-once semantics.

## Out of scope

- AGT / OPA / Cedar provider adapters (MASTER-09)
- agent identity providers (MASTER-09)
- enterprise approval orchestration beyond the exact confirmation primitive (MASTER-09)
- policy simulation (MASTER-10)
- durable distributed idempotency / deployment persistence
- audit persistence / replay ledger (MASTER-17)
- compensation / saga semantics
- connector credentials or action-specific backend clients

Those layers may consume MASTER-08 but may not bypass its core safety checks.

## Verification policy

The stack is intentionally being completed before the final CI run. Hosted CI is not an intermediate phase blocker; the user will run the authoritative local/full CI after all master phases are implemented.

Final verification must cover at minimum:

- default deny;
- exact approval challenge/grant;
- cross-instance deny;
- malformed ActionIntent deny;
- stale revision deny;
- revision-provider regression deny;
- same-action double click deny;
- new-action/same-idempotency-key retry deny;
- two different writes from the same revision conflict;
- uncertain adapter failure remains consumed;
- deterministic no-effect result releases effect revision ownership;
- successful write must advance revision;
- canonical immutable ActionReceipt;
- package-boundary hygiene;
- Web/iOS/Android regression/conformance gates in final full CI.
