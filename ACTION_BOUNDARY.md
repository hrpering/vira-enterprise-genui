# Vira Action Boundary

## Purpose

The Vira Action Boundary is the current canonical controlled path through which a user- or agent-proposed semantic action may become a protected enterprise side effect.

Canonical implementation owner: `@vira-enterprise-genui/action-boundary`.

The package currently exports the `ViraActionIntent`, proposal/permit/effect, confirmation challenge/grant, idempotency, trusted adapter and `ViraActionReceipt` contract family through `createViraActionBoundary`.

RC evidence is separate from implementation status: MASTER-25R must still prove the integrated boundary against the exact post-CLEAN-00 release head.

## Why this boundary exists

A trusted-looking UI, agent recommendation or provider `allow` is not authority to mutate enterprise state.

Protected examples include booking/ordering/refund/settings/approval or privileged enterprise-tool effects.

## Canonical flow

```text
UI interaction / agent proposal
             ↓
         ActionIntent
             ↓
 structural + bounded validation
             ↓
 identity / tenant / instance context
             ↓
 provider-neutral governance
             ↓
 approval / challenge when required
             ↓
 revision + idempotency constraints
             ↓
 trusted action adapter
             ↓
 enterprise backend / tool
             ↓
        ActionReceipt
```

No renderer, protocol adapter, AI host or component implementation may skip directly to a protected adapter because it controls presentation or transport.

## Current owner relationships

- `runtime-core` owns the lower-level canonical runtime action/state/lifecycle primitives.
- `action-boundary` owns protected-action proposal/execution/receipt semantics.
- `governance` owns provider-neutral identity/governance/approval composition and external governance adapters.
- `enterprise-governance` applies enterprise governance composition without replacing the canonical owners.
- `enterprise-context` supplies enterprise-scoped context where required.
- `action-ledger` owns durable audit/ledger concerns around receipts; replay is observation, not re-execution.

## ActionIntent invariants

A protected proposal must bind enough exact context to avoid mutable-global routing. Depending on the registered action/effect, material context includes stable action identity, semantic action definition, bounded payload, runtime/deployment/Experience context, actor/tenant context, relevant expected revision and idempotency identity.

The boundary must never fill missing authority from `latest`, `activeInstance`, `currentExperience`, last-rendered UI state or customer/domain-specific fallback.

## Validation and decision ordering

1. **Structural validation** — reject malformed/unknown data before provider/backend execution.
2. **Identity/isolation** — resolve required principals and verify tenant/project/environment/instance ownership.
3. **Governance** — evaluate provider-neutral governance; provider error fails closed.
4. **Approval/challenge** — require valid evidence when governance demands it; challenge is not implicit allow.
5. **Revision/idempotency** — reject stale or replayed protected mutations according to the action contract.
6. **Trusted execution** — only a registered trusted adapter may cross into the protected backend/tool.
7. **Receipt** — normalize the outcome into canonical safe receipt/audit semantics.

Structural invalidity, tenant/instance mismatch and other non-overridable Vira safety constraints cannot be converted into allow by an external provider.

## Idempotency and retry

Vira does not claim universal exactly-once execution. It requires deterministic duplicate/stale defenses for common failure modes such as double-click, mobile reconnect, agent retry, network retry and process retry.

A repeat of the same safe idempotency identity must not blindly execute the protected mutation again. A different operation carrying a stale expected revision is not the same duplicate and fails according to stale-state semantics.

Uncertain adapter/transport outcomes must never be converted into an unsafe fresh retry by generating a new random identity.

## User and agent parity

User and agent actions may carry different actor identities, but protected effects converge on the same boundary.

```text
user UI ──────┐
              ├──> ActionIntent → governance/execution → receipt
agent action ─┘
```

There is no privileged agent bypass path.

## Approval as Experience

Human approval/challenge UX may be represented by the same cross-platform Experience system. Approval evidence resumes the original governed action context; the approval UI never performs the protected mutation directly.

## Failure classes

The canonical boundary preserves meaningful failure distinctions where unsafe retry could otherwise occur, including invalid intent, isolation mismatch, governance deny/evaluation failure, approval required/rejected/expired, stale revision, duplicate/replay, adapter failure, ambiguous execution outcome and invalid adapter result.

## Replay

Observability may reconstruct the semantic sequence from Experience → proposal → governance/challenge → adapter outcome → receipt. Replay never invokes the protected action adapter to reproduce history.

## Bypass violations

Architecture violations include:

- React/SwiftUI/Compose component directly calling a protected customer mutation endpoint;
- agent/protocol adapter skipping governance because it has a provider `allow`;
- implicit latest/active instance routing;
- approval UI directly executing the protected effect;
- retry after uncertain execution with fresh idempotency identity;
- external governance overriding structural validation or tenant isolation.

## Verification rule

Changes to this boundary require focused adversarial coverage for relevant allow/deny/challenge, user/agent, exact tenant/instance, unknown action, duplicate/retry, stale revision, adapter failure and receipt behavior, plus repository-wide verification and independent security/architecture review.
