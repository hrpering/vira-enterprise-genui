# Vira Action Boundary

## Purpose

The Vira Action Boundary is the target controlled path through which a user- or agent-proposed interaction becomes an enterprise side effect.

MASTER-01 freezes the contract. MASTER-08 implements the complete boundary.

Do not read this document as a claim that all identity, approval, provider governance and end-to-end idempotency controls already exist in current code.

## Why this boundary exists

Generative UI becomes enterprise-critical at the moment interaction causes a real mutation:

- submit an order;
- confirm a booking;
- issue a refund;
- change an account setting;
- approve a workflow;
- call a privileged enterprise tool.

A trusted-looking UI or an agent recommendation is not authority to perform that mutation.

## Current action foundations

### Runtime action

Current `runtime-core` validates a canonical runtime action with:

```text
id
semantic type
source: user | host | system
JSON payload
```

It provides deterministic action validation and permission evaluation. Current permission rules support `allow`, `deny` and `confirm`, with default deny when no rule matches.

### Studio runtime / host bridge

Current Studio runtime and `studio-host-runtime` provide additional useful safeguards:

- approved interaction mapping produces canonical actions;
- host snapshots carry monotonically accepted revisions;
- backward snapshot revisions fail;
- duplicate revision delivery does not mutate accepted state;
- a runtime action ID is forwarded to a host at most once per adapter/session pair;
- an uncertain host transport failure is not automatically replayed;
- runtime completion records `success`, `empty` or `error`.

These controls remain valid and must not be regressed.

### What current code does not yet provide as one canonical boundary

The current action contracts do not yet combine all of the following into one cross-platform enterprise transaction context:

- user identity;
- agent/service identity;
- tenant/project/environment identity;
- exact Experience/Pack/publication/deployment identity;
- exact runtime `instanceId`;
- provider-neutral governance verdict;
- approval evidence;
- end-to-end idempotency key;
- expected state revision attached to the protected operation;
- canonical ActionReceipt.

MASTER-08 owns that implementation.

## Target pipeline

All protected user and agent actions converge on the same pipeline:

```text
UI interaction / Agent proposal
             │
             ▼
         ActionIntent
             │
             ▼
       structural validation
             │
             ▼
      identity resolution
             │
             ▼
       tenant / instance guard
             │
             ▼
       policy evaluation
             │
             ▼
   approval / challenge if required
             │
             ▼
 expected revision + idempotency guard
             │
             ▼
     trusted action adapter
             │
             ▼
       enterprise backend
             │
             ▼
        ActionReceipt
```

No renderer, protocol bridge or agent framework may skip directly from proposal to protected adapter.

## ActionIntent — target responsibility

`ActionIntent` is the canonical proposal to perform a semantic action. Its final schema belongs to MASTER-08, but the architecture requires it to bind sufficient context to make a deterministic security/concurrency decision.

Required concepts include:

- stable `actionId`;
- semantic action type;
- bounded validated payload;
- exact runtime `instanceId`;
- exact Experience/deployment context;
- actor context (user and/or agent/service as applicable);
- tenant/project/environment context;
- `expectedStateRevision` when state concurrency is material;
- `idempotencyKey` for protected mutations/retry handling.

The boundary must not depend on a mutable global `currentExperience` or `activeInstance` to fill missing context.

## Validation order

### 1. Structural validation

Reject malformed/unknown action fields and payload shapes before external policy or backend calls.

Structural invalidity is not a normal policy deny that a provider can override.

### 2. Identity resolution

Resolve the relevant authenticated user/agent/service principals and bind them to the action context.

A caller-supplied display name is not identity authority.

### 3. Tenant / project / environment / instance isolation

Verify that all referenced deployment, Experience and runtime instance identities belong to the authorized context.

Cross-instance and cross-tenant routing fails before side-effect execution.

### 4. Governance policy

Evaluate provider-neutral Vira policy using the validated, identity-bound context.

Evaluation errors fail closed.

### 5. Approval / challenge

If policy requires human approval, step-up authentication, second approver or another challenge, execution pauses until valid evidence is bound to the exact material action context.

A challenge is not an implicit allow.

### 6. Revision / idempotency guard

Protected state mutations verify relevant expected revision and duplicate semantics before adapter execution.

### 7. Trusted adapter execution

Only a registered trusted action adapter may cross into customer backend/tool execution.

The adapter receives the minimum validated context it owns. It does not receive arbitrary renderer objects or unvalidated model output.

### 8. Receipt

The result is normalized into an `ActionReceipt` sufficient for audit/replay/state evolution without exposing secrets.

## Idempotency model

Vira does not claim impossible universal exactly-once execution.

Instead it targets explicit duplicate handling across common failure/retry modes:

```text
double click
network retry
agent retry
mobile reconnect
client timeout
process retry
```

### Example

```text
state revision = 42
idempotency key = K

Confirm Booking
expected revision = 42
        ↓
execute once
        ↓
receipt committed
state revision = 43

same action/key arrives again
        ↓
recognize duplicate / return prior safe result
        ↓
do not blindly execute again
```

If a different operation arrives with stale `expectedStateRevision = 42`, it fails as stale rather than being treated as the same duplicate.

## Relationship to current duplicate-forward guard

The current `studio-host-runtime` marks an action ID before crossing the host dispatch boundary and rejects a second forward for the same session.

Keep this defense.

MASTER-08 must add the broader transaction-level model required across:

- process boundaries;
- mobile reconnect;
- multiple hosts;
- backend retries;
- agent retry loops;
- deployment/runtime restarts.

A local in-memory set is not an end-to-end idempotency store.

## Revision semantics

Current Studio host snapshots already use a monotonic `revision` as host state change token.

Target protected mutations must explicitly define which revision is authoritative for concurrency checks. The Action Boundary must not ambiguously mix:

- host snapshot revision;
- runtime internal revision;
- deployment revision;
- artifact version.

These identities must remain distinct even if an adapter chooses to correlate them.

## User and agent actions

A user click and an agent tool/action proposal may have different initiators, but protected side effects use the same boundary.

```text
user UI ──────┐
              ├──> ActionIntent → same governance/execution path
agent action ─┘
```

Policy can distinguish actor type/identity. The execution mechanics are not duplicated into a separate privileged “agent path.”

## Approval as an Experience

A challenge requiring human action should be representable through the same cross-platform Experience system.

Example:

```text
Refund €4,000
Customer #9381
Policy: manager approval required
        ↓
Approval Experience
        ↓
Approve / Reject
        ↓
bound approval evidence
        ↓
resume original ActionIntent decision
```

The approval UI does not itself execute the refund outside the boundary.

## Provider-neutral verdict — target

The exact schema belongs to MASTER-09, but Action Boundary depends on a provider-neutral effect model rather than provider-specific branching throughout runtime code.

Expected concepts:

- allow;
- deny;
- challenge;
- transform with explicit obligations.

Vira core validation/isolation can still reject after a provider says allow if the action violates a non-overridable safety invariant.

## Transform obligations

A policy transform is not permission to mutate arbitrary action fields.

Any transformed payload/action must be revalidated against the canonical action contract, and the receipt/audit chain records the effective action actually executed.

## ActionReceipt — target

A receipt should make the execution outcome auditable without becoming a secret/data dump.

Required concepts may include:

- action and idempotency identity;
- effective semantic action type;
- exact Experience/deployment/instance context;
- policy/approval decision references;
- adapter outcome/status;
- resulting accepted revision where applicable;
- safe evidence/audit references.

Provider-specific raw response bodies are not the canonical receipt model.

## Failure classes

At minimum distinguish:

- invalid intent;
- identity failure;
- isolation mismatch;
- policy deny;
- policy evaluation failure;
- approval required/pending/rejected/expired;
- stale revision;
- duplicate/replayed intent;
- adapter failure;
- ambiguous execution/transport outcome;
- invalid adapter result;
- disposed/cancelled runtime context.

Do not collapse every failure into a generic `error` if doing so would cause unsafe retry behavior.

## Replay

Observability/replay may reconstruct:

```text
Experience shown
→ interaction proposed
→ ActionIntent
→ policy/challenge
→ approval evidence
→ adapter execution
→ receipt/state outcome
```

Replay never invokes the trusted action adapter again merely to reproduce history.

## Bypass rules

The following are architecture violations:

- React/SwiftUI/Compose component directly calling a protected customer mutation endpoint;
- agent tool implementation skipping Vira governance for an action represented as a Vira Experience;
- protocol adapter invoking the backend because it received an `allow` provider field;
- global latest/active instance used to route a command;
- approval UI directly performing the protected side effect;
- retry after uncertain execution with a new random idempotency identity;
- policy provider overriding structural validation or tenant isolation.

## MASTER-08 implementation gate

MASTER-08 is complete only when the common Action Boundary is executable and covered by adversarial tests for at least:

- user and agent actors;
- allow and deny;
- challenge/approval;
- policy evaluation failure;
- exact tenant/instance routing;
- unknown action;
- double click;
- duplicate retry;
- stale revision;
- uncertain adapter failure;
- receipt generation;
- cross-platform production of equivalent semantic intent.